import { confirm } from '@inquirer/prompts'
// eslint-disable-next-line import/default
import CRC32 from 'crc-32'
import EventEmitter from 'node:events'
import { SLStatus } from 'zigbee-herdsman/dist/adapter/ember/enums.js'

import { logger } from '../index.js'
import { TCP_REGEX } from './consts.js'
import { Cpc, CpcEvent } from './cpc.js'
import { emberStart, emberStop } from './ember.js'
import { FirmwareValidation } from './enums.js'
import { Transport, TransportEvent } from './serial.js'
import { AdapterModel, CpcSystemStatus, FirmwareFileMetadata, PortConf } from './types.js'
import { XEvent, XExitStatus, XModemCRC } from './xmodem.js'

const NS = { namespace: 'gecko' }

export enum BootloaderState {
    /** Not connected to bootloader (i.e. not any of below) */
    NOT_CONNECTED = 0,
    /** Waiting in menu */
    IDLE = 1,
    /** Triggered 'Upload GBL' menu */
    BEGIN_UPLOAD = 2,
    /** Received 'begin upload' */
    UPLOADING = 3,
    /** GBL upload completed */
    UPLOADED = 4,
    /** Triggered 'Run' menu */
    RUNNING = 5,
    /** Triggered 'EBL Info' menu */
    GETTING_INFO = 6,
    /** Received response for 'EBL Info' menu */
    GOT_INFO = 7,
}

export enum BootloaderMenu {
    UPLOAD_GBL = 0x31,
    RUN = 0x32,
    INFO = 0x33,
    CLEAR_NVM3 = 0xff,
}

const CARRIAGE_RETURN = 0x0d
const NEWLINE = 0x0a
const BOOTLOADER_KNOCK = Buffer.from([NEWLINE])
/** "BL >" ascii */
const BOOTLOADER_PROMPT = Buffer.from([0x42, 0x4c, 0x20, 0x3e])
/** "Bootloader v" ascii */
const BOOTLOADER_INFO = Buffer.from([0x42, 0x6f, 0x6f, 0x74, 0x6c, 0x6f, 0x61, 0x64, 0x65, 0x72, 0x20, 0x76])
/** "begin upload" acsii */
const BOOTLOADER_BEGIN_UPLOAD = Buffer.from([0x62, 0x65, 0x67, 0x69, 0x6e, 0x20, 0x75, 0x70, 0x6c, 0x6f, 0x61, 0x64])
/** "Serial upload complete" ascii */
const BOOTLOADER_UPLOAD_COMPLETE = Buffer.from([
    0x53, 0x65, 0x72, 0x69, 0x61, 0x6c, 0x20, 0x75, 0x70, 0x6c, 0x6f, 0x61, 0x64, 0x20, 0x63, 0x6f, 0x6d, 0x70, 0x6c, 0x65, 0x74, 0x65,
])
/** "Serial upload aborted" ascii */
const BOOTLOADER_UPLOAD_ABORTED = Buffer.from([
    0x53, 0x65, 0x72, 0x69, 0x61, 0x6c, 0x20, 0x75, 0x70, 0x6c, 0x6f, 0x61, 0x64, 0x20, 0x61, 0x62, 0x6f, 0x72, 0x74, 0x65, 0x64,
])

const BOOTLOADER_KNOCK_TIMEOUT = 2000
const BOOTLOADER_UPLOAD_TIMEOUT = 120000
const BOOTLOADER_UPLOAD_EXIT_TIMEOUT = 500
const BOOTLOADER_CMD_EXEC_TIMEOUT = 200

const GBL_START_TAG = Buffer.from([0xeb, 0x17, 0xa6, 0x03])
/** Contains length+CRC32 and possibly padding after this. */
const GBL_END_TAG = Buffer.from([0xfc, 0x04, 0x04, 0xfc])
const GBL_METADATA_TAG = Buffer.from([0xf6, 0x08, 0x08, 0xf6])
const VALID_FIRMWARE_CRC32 = 558161692

const NVM3_INIT_START =
    'eb17a603080000000000000300000000f40a0af41c00000000000000000000000000000000000000000000000000000000000000fd0303fd0480000000600b00'
const NVM3_INIT_BLANK_CHUNK_START = '01009ab2010000d0feffff0fffffffff0098'
const NVM3_INIT_BLANK_CHUNK_LENGTH = 8174
const NVM3_INIT_END = 'fc0404fc040000004b83c4aa'

export enum BootloaderEvent {
    FAILED = 'failed',
    CLOSED = 'closed',
    UPLOAD_START = 'uploadStart',
    UPLOAD_STOP = 'uploadStop',
    UPLOAD_PROGRESS = 'uploadProgress',
}

interface GeckoBootloaderEventMap {
    [BootloaderEvent.CLOSED]: []
    [BootloaderEvent.FAILED]: []
    [BootloaderEvent.UPLOAD_PROGRESS]: [percent: number]
    [BootloaderEvent.UPLOAD_START]: []
    [BootloaderEvent.UPLOAD_STOP]: [status: XExitStatus]
}

export class GeckoBootloader extends EventEmitter<GeckoBootloaderEventMap> {
    public readonly adapterModel?: AdapterModel
    public readonly portConf: PortConf
    public readonly transport: Transport
    public readonly xmodem: XModemCRC
    private state: BootloaderState

    private waiter:
        | {
              /** Expected to return true if properly resolved, false if timed out and timeout not considered hard-fail */
              resolve: (value: PromiseLike<boolean> | boolean) => void
              state: BootloaderState
              timeout: NodeJS.Timeout
          }
        | undefined

    constructor(portConf: PortConf, adapter?: AdapterModel) {
        super()

        this.state = BootloaderState.NOT_CONNECTED
        this.waiter = undefined
        this.portConf = portConf
        this.adapterModel = adapter
        // override config to default for serial gecko bootloader
        this.transport = new Transport({
            ...this.portConf,
            baudRate: 115200,
            rtscts: false,
            xon: false,
            xoff: false,
        })
        this.xmodem = new XModemCRC()

        this.transport.on(TransportEvent.FAILED, this.onTransportFailed.bind(this))
        this.transport.on(TransportEvent.DATA, this.onTransportData.bind(this))

        this.xmodem.on(XEvent.START, this.onXModemStart.bind(this))
        this.xmodem.on(XEvent.STOP, this.onXModemStop.bind(this))
        this.xmodem.on(XEvent.DATA, this.onXModemData.bind(this))
    }

    public async connect(forceReset: boolean): Promise<void> {
        if (this.state !== BootloaderState.NOT_CONNECTED) {
            logger.debug(`Already connected to bootloader. Skipping connect attempt.`, NS)
            return
        }

        logger.info(`Connecting to bootloader...`, NS)

        // check if already in bootloader, or try to force into it if requested, don't fail if not successful
        await this.knock(false, forceReset)

        // @ts-expect-error changed by received serial data
        if (this.state !== BootloaderState.IDLE) {
            // not already in bootloader, so launch it, then knock again
            const isRCP = await confirm({
                default: false,
                message: 'Is currently installed firmware RCP (multiprotocol)?',
            })

            isRCP ? await this.cpcLaunch() : await this.ezspLaunch()
            // this time will fail if not successful since exhausted all possible ways
            await this.knock(true)

            // @ts-expect-error changed by received serial data
            if (this.state !== BootloaderState.IDLE) {
                logger.error(`Failed to enter bootloader menu.`, NS)
                this.emit(BootloaderEvent.FAILED)
                return
            }
        }

        logger.info(`Connected to bootloader.`, NS)
    }

    public async navigate(menu: BootloaderMenu, firmware?: Buffer): Promise<boolean> {
        this.waiter = undefined
        this.state = BootloaderState.IDLE

        switch (menu) {
            case BootloaderMenu.UPLOAD_GBL: {
                if (firmware === undefined) {
                    logger.error(`Navigating to upload GBL requires a valid firmware.`, NS)
                    await this.transport.close(false) // don't emit closed since we're returning true which will close anyway

                    return true
                }

                return this.menuUploadGBL(firmware)
            }

            case BootloaderMenu.RUN: {
                return this.menuRun()
            }

            case BootloaderMenu.INFO: {
                return this.menuGetInfo()
            }

            case BootloaderMenu.CLEAR_NVM3: {
                const confirmed = await confirm({
                    default: false,
                    message: 'Confirm NVM3 clearing? (Cannot be undone.)',
                })

                if (!confirmed) {
                    logger.warning(`Cancelled NVM3 clearing.`, NS)
                    return false
                }

                return this.menuUploadGBL(
                    Buffer.concat([
                        Buffer.from(NVM3_INIT_START, 'hex'),
                        Buffer.from(NVM3_INIT_BLANK_CHUNK_START, 'hex'),
                        Buffer.alloc(NVM3_INIT_BLANK_CHUNK_LENGTH, 0xff),
                        Buffer.from(NVM3_INIT_BLANK_CHUNK_START, 'hex'),
                        Buffer.alloc(NVM3_INIT_BLANK_CHUNK_LENGTH, 0xff),
                        Buffer.from(NVM3_INIT_BLANK_CHUNK_START, 'hex'),
                        Buffer.alloc(NVM3_INIT_BLANK_CHUNK_LENGTH, 0xff),
                        Buffer.from(NVM3_INIT_BLANK_CHUNK_START, 'hex'),
                        Buffer.alloc(NVM3_INIT_BLANK_CHUNK_LENGTH, 0xff),
                        Buffer.from(NVM3_INIT_END, 'hex'),
                    ]),
                )
            }
        }
    }

    public async resetByPattern(knock: boolean = false): Promise<void> {
        if (!this.transport.isSerial) {
            logger.error(`Reset by pattern unavailable for TCP.`, NS)
            return
        }

        switch (this.adapterModel) {
            // TODO: support per adapter
            case 'Sonoff ZBDongle-E':
            case undefined: {
                await this.transport.serialSet({ dtr: false, rts: true })
                await this.transport.serialSet({ dtr: true, rts: false }, 100)

                if (!knock) {
                    await this.transport.serialSet({ dtr: false }, 500)
                }

                break
            }

            default: {
                logger.error(`Reset by pattern unavailable on ${this.adapterModel}.`, NS)
            }
        }
    }

    public async validateFirmware(firmware: Buffer | undefined, supportedVersionsRegex: RegExp): Promise<FirmwareValidation> {
        if (!firmware) {
            logger.error(`Cannot proceed without a firmware file.`, NS)
            return FirmwareValidation.INVALID
        }

        if (firmware.indexOf(GBL_START_TAG) !== 0) {
            logger.error(`Firmware file invalid. GBL start tag not found.`, NS)
            return FirmwareValidation.INVALID
        }

        const endTagStart = firmware.lastIndexOf(GBL_END_TAG)

        if (endTagStart === -1) {
            logger.error(`Firmware file invalid. GBL end tag not found.`, NS)
            return FirmwareValidation.INVALID
        }

        // eslint-disable-next-line import/no-named-as-default-member
        const computedCRC32 = CRC32.buf(firmware.subarray(0, endTagStart + 12), 0) // tag+length+crc32 (4+4+4)

        if (computedCRC32 !== VALID_FIRMWARE_CRC32) {
            logger.error(`Firmware file invalid. Failed CRC validation (got ${computedCRC32}, expected ${VALID_FIRMWARE_CRC32}).`, NS)
            return FirmwareValidation.INVALID
        }

        const metaTagStart = firmware.lastIndexOf(GBL_METADATA_TAG)

        if (metaTagStart === -1) {
            const proceed = await confirm({
                default: false,
                message: `Firmware file does not contain metadata. Cannot validate it. Proceed with this firmware?`,
            })

            if (!proceed) {
                logger.warning(`Cancelling firmware update.`, NS)
                return FirmwareValidation.CANCELLED
            }

            return FirmwareValidation.VALID
        }

        const metaTagLength = firmware.readUInt32LE(metaTagStart + GBL_METADATA_TAG.length)
        const metaStart = metaTagStart + GBL_METADATA_TAG.length + 4
        const metaEnd = metaStart + metaTagLength
        const metaBuf = firmware.subarray(metaStart, metaEnd)
        logger.debug(
            `Metadata: tagStart=${metaTagStart}, tagLength=${metaTagLength}, start=${metaStart}, end=${metaEnd}, data=${metaBuf.toString('hex')}`,
            NS,
        )

        try {
            const recdMetadata: FirmwareFileMetadata = JSON.parse(metaBuf.toString('utf8'))

            logger.info(`Firmware file metadata: ${JSON.stringify(recdMetadata)}`, NS)

            if (!TCP_REGEX.test(this.portConf.path) && recdMetadata.baudrate !== this.portConf.baudRate) {
                logger.warning(
                    `Firmware file baudrate ${recdMetadata.baudrate} differs from your current port configuration of ${this.portConf.baudRate}.`,
                    NS,
                )
            }

            if (!recdMetadata.ezsp_version || !supportedVersionsRegex.test(recdMetadata.ezsp_version)) {
                logger.warning(`Firmware file version is not recognized as currently supported by Zigbee2MQTT ember driver.`, NS)
            }

            const proceed = await confirm({
                default: false,
                message: `Version: ${recdMetadata.ezsp_version}, Baudrate: ${recdMetadata.baudrate}. Proceed with this firmware?`,
            })

            if (!proceed) {
                logger.warning(`Cancelling firmware update.`, NS)
                return FirmwareValidation.CANCELLED
            }
        } catch (error) {
            logger.error(`Failed to validate firmware file: ${error}.`, NS)
            return FirmwareValidation.INVALID
        }

        return FirmwareValidation.VALID
    }

    private async cpcLaunch(): Promise<void> {
        logger.debug(`Launching bootloader from CPC...`, NS)

        const cpc = new Cpc(this.portConf)

        await cpc.start()

        cpc.on(CpcEvent.FAILED, this.onTransportFailed.bind(this))

        try {
            const status = await cpc.cpcLaunchStandaloneBootloader()

            if (status !== CpcSystemStatus.OK) {
                throw new Error(CpcSystemStatus[status])
            }
        } catch (error) {
            logger.error(`Unable to launch bootloader from CPC: ${error}`, NS)
            this.emit(BootloaderEvent.FAILED)
            return
        }

        await cpc.stop()
    }

    private async ezspLaunch(): Promise<void> {
        logger.debug(`Launching bootloader from EZSP...`, NS)

        const ezsp = await emberStart(this.portConf)

        try {
            const status = await ezsp.ezspLaunchStandaloneBootloader(true)

            if (status !== SLStatus.OK) {
                throw new Error(SLStatus[status])
            }
        } catch (error) {
            logger.error(`Unable to launch bootloader from EZSP: ${error}`, NS)
            this.emit(BootloaderEvent.FAILED)
            return
        }

        // free serial
        await emberStop(ezsp)
    }

    private async knock(fail: boolean, forceReset: boolean = false): Promise<void> {
        logger.debug(`Knocking...`, NS)

        try {
            await this.transport.initPort()

            if (forceReset) {
                await this.resetByPattern(true)

                if (this.state === BootloaderState.IDLE) {
                    logger.debug(`Entered bootloader via pattern reset.`, NS)
                    return
                }
            }
        } catch (error) {
            logger.error(`Failed to open port: ${error}.`, NS)
            await this.transport.close(false, false) // force failed below
            this.emit(BootloaderEvent.FAILED)

            return
        }

        await this.transport.write(BOOTLOADER_KNOCK)

        const res = await this.waitForState(BootloaderState.IDLE, BOOTLOADER_KNOCK_TIMEOUT, fail)

        if (!res) {
            await this.transport.close(fail) // emit closed based on if we want to fail on unsuccessful knock

            if (fail) {
                logger.error(`Unable to enter bootloader.`, NS)
            } else {
                logger.info(`Unable to enter bootloader.`, NS)
            }
        }
    }

    private async menuGetInfo(): Promise<boolean> {
        logger.debug(`Entering 'Info' menu...`, NS)

        this.state = BootloaderState.GETTING_INFO

        await this.transport.write(Buffer.from([BootloaderMenu.INFO]))

        await this.waitForState(BootloaderState.GOT_INFO, BOOTLOADER_CMD_EXEC_TIMEOUT)

        return false
    }

    private async menuRun(): Promise<boolean> {
        logger.debug(`Entering 'Run' menu...`, NS)

        this.state = BootloaderState.RUNNING

        await this.transport.write(Buffer.from([BootloaderMenu.RUN]))

        const res = await this.waitForState(BootloaderState.IDLE, BOOTLOADER_CMD_EXEC_TIMEOUT, false)

        if (res) {
            // got menu back, failed to run
            logger.warning(`Failed to exit bootloader and run firmware. Trying pattern reset...`, NS)

            await this.resetByPattern()
        }

        return true
    }

    private async menuUploadGBL(firmware: Buffer): Promise<boolean> {
        logger.debug(`Entering 'Upload GBL' menu...`, NS)

        this.xmodem.init(firmware)

        this.state = BootloaderState.BEGIN_UPLOAD

        await this.transport.write(Buffer.from([BootloaderMenu.UPLOAD_GBL])) // start upload
        await this.waitForState(BootloaderState.UPLOADING, BOOTLOADER_UPLOAD_EXIT_TIMEOUT)
        await this.waitForState(BootloaderState.UPLOADED, BOOTLOADER_UPLOAD_TIMEOUT)

        const res = await this.waitForState(BootloaderState.IDLE, BOOTLOADER_UPLOAD_EXIT_TIMEOUT, false)

        if (!res) {
            // force back to menu if not automatically back to it already
            await this.transport.write(BOOTLOADER_KNOCK)
            await this.waitForState(BootloaderState.IDLE, BOOTLOADER_UPLOAD_EXIT_TIMEOUT)
        }

        return false
    }

    private async onTransportData(received: Buffer): Promise<void> {
        logger.debug(`Received transport data: ${received.toString('hex')} while in state ${BootloaderState[this.state]}.`, NS)

        switch (this.state) {
            case BootloaderState.NOT_CONNECTED: {
                if (received.includes(BOOTLOADER_PROMPT)) {
                    this.resolveState(BootloaderState.IDLE)
                }

                break
            }

            case BootloaderState.IDLE: {
                break
            }

            case BootloaderState.BEGIN_UPLOAD: {
                if (received.includes(BOOTLOADER_BEGIN_UPLOAD)) {
                    this.resolveState(BootloaderState.UPLOADING)
                }

                break
            }

            case BootloaderState.UPLOADING: {
                // just hand over to xmodem
                return this.xmodem.process(received)
            }

            case BootloaderState.UPLOADED: {
                if (received.includes(BOOTLOADER_UPLOAD_ABORTED)) {
                    logger.error(`Firmware upload aborted.`, NS)
                } else if (received.includes(BOOTLOADER_UPLOAD_COMPLETE)) {
                    logger.info(`Firmware upload completed.`, NS)
                } else if (received.includes(BOOTLOADER_PROMPT)) {
                    this.resolveState(BootloaderState.IDLE)
                }

                break
            }

            case BootloaderState.RUNNING: {
                const blv = received.indexOf(BOOTLOADER_INFO)

                if (blv !== -1) {
                    const [blInfo] = this.readBootloaderInfo(received, blv)

                    logger.info(`Received bootloader info while trying to exit: ${blInfo}.`, NS)
                } else if (received.includes(BOOTLOADER_PROMPT)) {
                    this.resolveState(BootloaderState.IDLE)
                }

                break
            }

            case BootloaderState.GETTING_INFO: {
                const blv = received.indexOf(BOOTLOADER_INFO)

                if (blv !== -1) {
                    this.resolveState(BootloaderState.GOT_INFO)

                    const [blInfo] = this.readBootloaderInfo(received, blv)

                    logger.info(`${blInfo}.`, NS)
                }

                break
            }

            case BootloaderState.GOT_INFO: {
                if (received.includes(BOOTLOADER_PROMPT)) {
                    this.resolveState(BootloaderState.IDLE)
                }

                break
            }
        }
    }

    private onTransportFailed(): void {
        this.state = BootloaderState.NOT_CONNECTED
        this.emit(BootloaderEvent.FAILED)
    }

    private async onXModemData(data: Buffer, progressPc: number): Promise<void> {
        this.emit(BootloaderEvent.UPLOAD_PROGRESS, progressPc)
        await this.transport.write(data)
    }

    private async onXModemStart(): Promise<void> {
        this.emit(BootloaderEvent.UPLOAD_START)
    }

    private async onXModemStop(status: XExitStatus): Promise<void> {
        this.resolveState(BootloaderState.UPLOADED)
        this.emit(BootloaderEvent.UPLOAD_STOP, status)
    }

    private readBootloaderInfo(buffer: Buffer, blvIndex: number): [info: string, hasExtras: boolean] {
        // cleanup start
        let startIndex = 0

        if (buffer[0] === CARRIAGE_RETURN) {
            startIndex = buffer[1] === NEWLINE ? 2 : 1
        } else if (buffer[0] === NEWLINE) {
            startIndex = 1
        }

        const infoBuf = buffer.subarray(startIndex, buffer.indexOf(NEWLINE, blvIndex) + 1)

        if (infoBuf.length === 0) {
            return ['', false]
        }

        logger.debug(`Reading info from: ${infoBuf.toString('hex')}.`, NS)
        let hasNewline: boolean = true
        let newlineStart: number = 0
        const lines: string[] = []

        while (hasNewline) {
            const newlineEnd = infoBuf.indexOf(NEWLINE, newlineStart)

            if (newlineEnd === -1) {
                hasNewline = false
            } else {
                const newline: Buffer = infoBuf.subarray(newlineStart, newlineEnd - (infoBuf[newlineEnd - 1] === CARRIAGE_RETURN ? 1 : 0))
                newlineStart = newlineEnd + 1

                if (newline.length > 2) {
                    lines.push(newline.toString('ascii'))
                }
            }
        }

        return [lines.join('. '), lines.length > 1] // regular only has the bootloader version line, if more, means extra
    }

    private resolveState(state: BootloaderState): void {
        if (this.waiter?.state === state) {
            clearTimeout(this.waiter.timeout)
            this.waiter.resolve(true)

            this.waiter = undefined
        }

        logger.debug(`New bootloader state: ${BootloaderState[state]}.`, NS)
        // always set even if no waiter
        this.state = state
    }

    private waitForState(state: BootloaderState, timeout: number = 5000, fail: boolean = true): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            this.waiter = {
                resolve,
                state,
                timeout: setTimeout(() => {
                    const msg = `Timed out waiting for ${BootloaderState[state]} after ${timeout}ms.`

                    if (fail) {
                        logger.error(msg, NS)
                        this.emit(BootloaderEvent.FAILED)
                        return
                    }

                    logger.debug(msg, NS)
                    resolve(false)
                    this.waiter = undefined
                }, timeout),
            }
        })
    }
}
