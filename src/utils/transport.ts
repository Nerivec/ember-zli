import type { PortConf } from './types.js'

import EventEmitter from 'node:events'
import { Socket } from 'node:net'
import { Readable } from 'node:stream'

import { SerialPort } from 'zigbee-herdsman/dist/adapter/serialPort.js'

import { logger } from '../index.js'
import { CONFIG_HIGHWATER_MARK, TCP_REGEX } from './consts.js'

const NS = { namespace: 'transport' }

type SetOptions = {
    brk?: boolean
    cts?: boolean
    dsr?: boolean
    dtr?: boolean
    rts?: boolean
}

class TransportWriter extends Readable {
    public writeBytes(bytesToWrite: Buffer): void {
        this.emit('data', bytesToWrite)
    }

    public _read(): void {}
}

export enum TransportEvent {
    CLOSED = 'closed',
    DATA = 'data',
    FAILED = 'failed',
}

interface SerialEventMap {
    [TransportEvent.CLOSED]: []
    [TransportEvent.DATA]: [data: Buffer]
    [TransportEvent.FAILED]: []
}

/**
 * Serial or Socket based transport based on passed conf.
 */
export class Transport extends EventEmitter<SerialEventMap> {
    public connected: boolean
    public readonly portConf: PortConf
    public portWriter: TransportWriter | undefined
    private portSerial: SerialPort | undefined
    private portSocket: Socket | undefined

    constructor(portConf: PortConf) {
        super()

        this.connected = false
        this.portConf = portConf
    }

    get isSerial(): boolean {
        return Boolean(this.portSerial)
    }

    public async close(emitClosed: boolean, emitFailed: boolean = true): Promise<void> {
        if (this.portSerial?.isOpen) {
            logger.info(`Closing serial connection...`, NS)

            try {
                await this.portSerial.asyncFlushAndClose()
            } catch (error) {
                logger.error(`Failed to close port: ${error}.`, NS)
                this.portSerial.removeAllListeners()

                if (emitFailed) {
                    this.emit(TransportEvent.FAILED)
                }

                return
            }

            this.portSerial.removeAllListeners()
        } else if (this.portSocket !== undefined && !this.portSocket.closed) {
            logger.info(`Closing socket connection...`, NS)
            this.portSocket.destroy()
            this.portSocket.removeAllListeners()
        }

        if (emitClosed) {
            this.emit(TransportEvent.CLOSED)
        }
    }

    public async initPort(): Promise<void> {
        // will do nothing if nothing's open
        await this.close(false)

        if (TCP_REGEX.test(this.portConf.path)) {
            const info = new URL(this.portConf.path)
            logger.debug(`Opening TCP socket with ${info.hostname}:${info.port}`, NS)

            this.portSocket = new Socket()

            this.portSocket.setNoDelay(true)
            this.portSocket.setKeepAlive(true, 15000)

            this.portWriter = new TransportWriter({ highWaterMark: CONFIG_HIGHWATER_MARK })

            this.portWriter.pipe(this.portSocket)
            this.portSocket.on('data', this.emitData.bind(this))

            return await new Promise((resolve, reject): void => {
                const openError = async (err: Error): Promise<void> => {
                    reject(err)
                }

                if (this.portSocket === undefined) {
                    reject(new Error(`Invalid socket`))
                    return
                }

                this.portSocket.on('connect', () => {
                    logger.debug(`Socket connected`, NS)
                })
                this.portSocket.on('ready', (): void => {
                    logger.info(`Socket ready`, NS)
                    this.portSocket!.removeListener('error', openError)
                    this.portSocket!.once('close', this.onPortClose.bind(this))
                    this.portSocket!.on('error', this.onPortError.bind(this))

                    this.connected = true

                    resolve()
                })
                this.portSocket.once('error', openError)
                this.portSocket.connect(Number.parseInt(info.port, 10), info.hostname)
            })
        }

        const serialOpts = {
            autoOpen: false,
            baudRate: this.portConf.baudRate,
            dataBits: 8 as const,
            parity: 'none' as const,
            path: this.portConf.path,
            rtscts: this.portConf.rtscts,
            stopBits: 1 as const,
            xoff: this.portConf.xoff,
            xon: this.portConf.xon,
        }

        logger.debug(`Opening serial port with ${JSON.stringify(serialOpts)}`, NS)

        this.portSerial = new SerialPort(serialOpts)
        this.portWriter = new TransportWriter({ highWaterMark: CONFIG_HIGHWATER_MARK })

        this.portWriter.pipe(this.portSerial)
        this.portSerial.on('data', this.emitData.bind(this))

        await this.portSerial.asyncOpen()
        logger.info(`Serial port opened`, NS)

        this.portSerial.once('close', this.onPortClose.bind(this))
        this.portSerial.on('error', this.onPortError.bind(this))

        this.connected = true
    }

    public async serialSet(options: SetOptions, afterDelayMS?: number): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const fn = (): void => this.portSerial?.set(options, (error) => (error ? reject(error) : resolve()))

            if (afterDelayMS) {
                setTimeout(fn, afterDelayMS)
            } else {
                fn()
            }
        })
    }

    public async write(buffer: Buffer): Promise<void> {
        if (this.portWriter === undefined) {
            logger.error(`No port available to write.`, NS)
            this.emit(TransportEvent.FAILED)
        } else {
            logger.debug(`Sending transport data: ${buffer.toString('hex')}.`, NS)
            this.portWriter.writeBytes(buffer)
        }
    }

    private emitData(data: Buffer): void {
        this.emit(TransportEvent.DATA, data)
    }

    private onPortClose(error: Error): void {
        logger.info(`Transport closed.`, NS)

        if (error && this.connected) {
            logger.info(`Transport close ${error}`, NS)
            this.emit(TransportEvent.FAILED)
        } else {
            this.emit(TransportEvent.CLOSED)
        }
    }

    private onPortError(error: Error): void {
        this.connected = false

        logger.info(`Transport ${error}`, NS)
        this.emit(TransportEvent.FAILED)
    }
}
