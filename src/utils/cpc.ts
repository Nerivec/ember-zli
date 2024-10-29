import EventEmitter from 'node:events'

import { EzspBuffalo } from 'zigbee-herdsman/dist/adapter/ember/ezsp/buffalo.js'

import { logger } from '../index.js'
import {
    CPC_DEFAULT_COMMAND_TIMEOUT,
    CPC_FLAG_UNNUMBERED_POLL_FINAL,
    CPC_HDLC_ADDRESS_POS,
    CPC_HDLC_CONTROL_FRAME_TYPE_SHIFT,
    CPC_HDLC_CONTROL_POS,
    CPC_HDLC_CONTROL_UNNUMBERED_TYPE_SHIFT,
    CPC_HDLC_FCS_SIZE,
    CPC_HDLC_FLAG_POS,
    CPC_HDLC_FLAG_VAL,
    CPC_HDLC_FRAME_TYPE_UNNUMBERED,
    CPC_HDLC_HCS_POS,
    CPC_HDLC_HEADER_RAW_SIZE,
    CPC_HDLC_HEADER_SIZE,
    CPC_HDLC_LENGTH_POS,
    CPC_PAYLOAD_LENGTH_MAX,
    CPC_PROPERTY_ID_BOOTLOADER_REBOOT_MODE,
    CPC_PROPERTY_ID_SECONDARY_CPC_VERSION,
    CPC_SERVICE_ENDPOINT_ID_SYSTEM,
    CPC_SYSTEM_COMMAND_HEADER_SIZE,
    CPC_SYSTEM_REBOOT_MODE_BOOTLOADER,
} from './consts.js'
import { Transport, TransportEvent } from './transport.js'
import { CpcSystemCommand, CpcSystemCommandId, CpcSystemStatus, Digit, FirmwareVersionShort, PortConf } from './types.js'
import { computeCRC16 } from './utils.js'

const NS = { namespace: 'cpc' }

export enum CpcEvent {
    FAILED = 'failed',
}

interface CpcEventMap {
    [CpcEvent.FAILED]: []
}

export class Cpc extends EventEmitter<CpcEventMap> {
    public readonly transport: Transport
    private buffalo: EzspBuffalo
    private sequence: number
    private waiter:
        | {
              /** Expected to return true if properly resolved, false if timed out and timeout not considered hard-fail */
              resolve: (value: CpcSystemCommand | PromiseLike<CpcSystemCommand>) => void
              sequence: number
              timeout: NodeJS.Timeout
          }
        | undefined

    constructor(portConf: PortConf) {
        super()

        this.sequence = 0
        this.waiter = undefined
        this.transport = new Transport(portConf)
        this.buffalo = new EzspBuffalo(Buffer.alloc(CPC_PAYLOAD_LENGTH_MAX), 0)

        this.transport.on(TransportEvent.FAILED, this.onTransportFailed.bind(this))
        this.transport.on(TransportEvent.DATA, this.onTransportData.bind(this))
    }

    public async cpcGetVersion(): Promise<FirmwareVersionShort> {
        this.buffalo.setPosition(0)
        this.buffalo.writeUInt32(CPC_PROPERTY_ID_SECONDARY_CPC_VERSION)

        // req: 14 00 0a00 c4 55d3 02 01 0400 03000000 baaa
        // rsp: 14 00 1600 c4 57e5 06 01 1000 03000000 04000000 05000000 00000000 6d3c
        const result = await this.sendSystemUFrame(CpcSystemCommandId.PROP_VALUE_GET)

        if (!result) {
            throw new Error(`Invalid result from PROP_VALUE_GET(SECONDARY_CPC_VERSION) response`)
        }

        // const propertyId = result.payload.readUInt32LE(0)
        const major = result.payload.readUInt32LE(4) as Digit
        const minor = result.payload.readUInt32LE(8) as Digit
        const patch = result.payload.readUInt32LE(12) as Digit

        return `${major}.${minor}.${patch}`
    }

    public async cpcLaunchStandaloneBootloader(): Promise<CpcSystemStatus> {
        this.buffalo.setPosition(0)
        this.buffalo.writeUInt32(CPC_PROPERTY_ID_BOOTLOADER_REBOOT_MODE)
        this.buffalo.writeUInt32(CPC_SYSTEM_REBOOT_MODE_BOOTLOADER)

        // req: 14 00 0e00 c4 950f 02 01 0800 02020000 01000000 190d
        // rsp: 14 00 0e00 c4 950f 06 01 0800 02020000 01000000 cd00
        const result = await this.sendSystemUFrame(CpcSystemCommandId.PROP_VALUE_SET)

        if (!result) {
            throw new Error(`Invalid result from PROP_VALUE_SET(BOOTLOADER_REBOOT_MODE) response.`)
        }

        const status: CpcSystemStatus = result.payload[0]

        // as of 4.5.0, this is actually returning UNIMPLEMENTED
        if (status !== CpcSystemStatus.OK && status !== CpcSystemStatus.UNIMPLEMENTED) {
            return status
        }

        this.buffalo.setPosition(0)
        // don't want to parse anything coming in after RESET is sent
        this.transport.removeAllListeners(TransportEvent.DATA)
        // req: 14 00 0300 90 b557 06 c660
        await this.sendSystemUFrame(CpcSystemCommandId.RESET, true)
        await new Promise((resolve) => {
            setTimeout(resolve, 500)
        })

        return CpcSystemStatus.OK
    }

    public receiveSystemUFrame(data: Buffer): void {
        if (data.length < CPC_HDLC_HEADER_RAW_SIZE) {
            throw new Error(`Received invalid System UFrame length=${data.length} [${data.toString('hex')}].`)
        }

        const flag = data.readUInt8(CPC_HDLC_FLAG_POS)

        if (flag !== CPC_HDLC_FLAG_VAL) {
            throw new Error(`Received invalid System UFrame flag=${CPC_HDLC_FLAG_VAL}.`)
        }

        // const address = data.readUInt8(CPC_HDLC_ADDRESS_POS)
        const frameLength = data.readUInt16LE(CPC_HDLC_LENGTH_POS)
        const expectedFrameLength = data.length - CPC_HDLC_HEADER_RAW_SIZE

        if (expectedFrameLength !== frameLength) {
            throw new Error(`Received invalid System UFrame length=${data.length} expected=${expectedFrameLength}.`)
        }

        const control = data.readUInt8(CPC_HDLC_CONTROL_POS)
        const frameType = control >> CPC_HDLC_CONTROL_FRAME_TYPE_SHIFT

        if (frameType !== CPC_HDLC_FRAME_TYPE_UNNUMBERED) {
            throw new Error(`Unsupported frame type ${frameType}.`)
        }

        // const unnumberedType = (control >> CPC_HDLC_CONTROL_UNNUMBERED_TYPE_SHIFT) & CPC_HDLC_CONTROL_UNNUMBERED_TYPE_MASK
        const headerChecksum = data.readUInt16LE(CPC_HDLC_HEADER_SIZE)
        const expectedHeaderChecksum = computeCRC16(data.subarray(0, CPC_HDLC_HEADER_SIZE)).readUInt16BE()

        if (headerChecksum !== expectedHeaderChecksum) {
            throw new Error(`Received invalid System UFrame headerChecksum=${headerChecksum} expected=${expectedHeaderChecksum}.`)
        }

        let i = CPC_HDLC_HEADER_RAW_SIZE
        const commandId = data.readUInt8(i++)
        const seq = data.readUInt8(i++)
        const length = data.readUInt8(i)
        i += 2
        const payload = data.subarray(i, -CPC_HDLC_FCS_SIZE)
        const frameChecksum = data.readUInt16LE(i + payload.length)
        const expectedFrameChecksum = computeCRC16(data.subarray(CPC_HDLC_HEADER_RAW_SIZE, -CPC_HDLC_FCS_SIZE)).readUInt16BE()

        if (frameChecksum !== expectedFrameChecksum) {
            throw new Error(`Received invalid System UFrame frameChecksum=${frameChecksum} expected=${expectedFrameChecksum}.`)
        }

        const command: CpcSystemCommand = { commandId, seq, length, payload }

        logger.debug(`Received System UFrame: ${JSON.stringify(command)}.`)

        this.resolveSequence(command)
    }

    public async sendSystemUFrame(commandId: CpcSystemCommandId, noResponse: boolean = false): Promise<CpcSystemCommand | undefined> {
        const payload = this.buffalo.getWritten()
        this.sequence = (this.sequence + 1) & 0xff

        const header = Buffer.alloc(CPC_HDLC_HEADER_SIZE)
        header.writeUInt8(CPC_HDLC_FLAG_VAL, CPC_HDLC_FLAG_POS)
        header.writeUInt8(CPC_SERVICE_ENDPOINT_ID_SYSTEM, CPC_HDLC_ADDRESS_POS)
        header.writeUInt16LE(CPC_SYSTEM_COMMAND_HEADER_SIZE + payload.length + CPC_HDLC_FCS_SIZE, CPC_HDLC_LENGTH_POS)
        header.writeUInt8(
            (CPC_HDLC_FRAME_TYPE_UNNUMBERED << CPC_HDLC_CONTROL_FRAME_TYPE_SHIFT) |
                (CPC_FLAG_UNNUMBERED_POLL_FINAL << CPC_HDLC_CONTROL_UNNUMBERED_TYPE_SHIFT),
            CPC_HDLC_CONTROL_POS,
        )

        const buffer = Buffer.alloc(CPC_HDLC_HEADER_RAW_SIZE + CPC_SYSTEM_COMMAND_HEADER_SIZE + payload.length + CPC_HDLC_FCS_SIZE)

        buffer.set(header, 0)

        const headerChecksum = computeCRC16(header).readUInt16BE()

        buffer.writeUInt16LE(headerChecksum, CPC_HDLC_HCS_POS)

        let i = CPC_HDLC_HEADER_RAW_SIZE
        buffer.writeUInt8(commandId, i++)
        buffer.writeUInt8(this.sequence, i++)
        buffer.writeUInt16LE(payload.length, i)
        i += 2
        buffer.set(payload, i)
        i += payload.length

        const frameChecksum = computeCRC16(buffer.subarray(CPC_HDLC_HEADER_RAW_SIZE, i)).readUInt16BE()

        buffer.writeUInt16LE(frameChecksum, i)

        await this.transport.write(buffer)

        if (noResponse) {
            return undefined
        }

        return this.waitForSequence(this.sequence, CPC_DEFAULT_COMMAND_TIMEOUT)
    }

    public async start(): Promise<void> {
        return this.transport.initPort()
    }

    public async stop(): Promise<void> {
        await this.transport.close(false)
    }

    private async onTransportData(received: Buffer): Promise<void> {
        logger.debug(`Received transport data: ${received.toString('hex')}.`, NS)

        this.receiveSystemUFrame(received)
    }

    private onTransportFailed(): void {
        this.emit(CpcEvent.FAILED)
    }

    private resolveSequence(command: CpcSystemCommand): void {
        if (this.waiter?.sequence === command.seq) {
            clearTimeout(this.waiter.timeout)
            this.waiter.resolve(command)

            this.waiter = undefined
        }
    }

    private waitForSequence(sequence: number, timeout: number = CPC_DEFAULT_COMMAND_TIMEOUT): Promise<CpcSystemCommand> {
        return new Promise<CpcSystemCommand>((resolve) => {
            this.waiter = {
                resolve,
                sequence,
                timeout: setTimeout(() => {
                    const msg = `Timed out waiting for sequence(${sequence}) after ${timeout}ms.`
                    this.waiter = undefined

                    logger.error(msg, NS)
                    this.emit(CpcEvent.FAILED)
                }, timeout),
            }
        })
    }
}
