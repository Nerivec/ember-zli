import { createSocket, Socket } from 'node:dgram'
import { createWriteStream, existsSync, WriteStream } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { confirm, input, select } from '@inquirer/prompts'
import { Command } from '@oclif/core'
import { Logger } from 'winston'

import { ZSpec } from 'zigbee-herdsman'
import { SLStatus } from 'zigbee-herdsman/dist/adapter/ember/enums.js'
import { Ezsp } from 'zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js'

import { DATA_FOLDER, DEFAULT_PCAP_PATH, logger } from '../../index.js'
import { emberStart, emberStop } from '../../utils/ember.js'
import { getPortConf } from '../../utils/port.js'
import { browseToFile, computeCRC16CITTKermit } from '../../utils/utils.js'
import { createPcapFileHeader, createPcapPacketRecordMs, createWiresharkZEPFrame, PCAP_MAGIC_NUMBER_MS } from '../../utils/wireshark.js'

const enum SniffMenu {
    START_SNIFFING = 0,
}

const DEFAULT_WIRESHARK_IP_ADDRESS = '127.0.0.1'
const DEFAULT_ZEP_UDP_PORT = 17754

export default class Sniff extends Command {
    static override args = {}
    static override description = 'Sniff Zigbee traffic (to Wireshark, to PCAP file, to custom handler or just log raw data).'
    static override examples = ['<%= config.bin %> <%= command.id %>']
    static override flags = {}

    public ezsp: Ezsp | undefined
    public sequence: number = 0
    public sniffing: boolean = false
    public udpSocket: Socket | undefined
    public pcapFileStream: WriteStream | undefined
    public wiresharkIPAddress: string = DEFAULT_WIRESHARK_IP_ADDRESS
    public zepUDPPort: number = DEFAULT_ZEP_UDP_PORT

    private customHandler: ((cmd: Command, logger: Logger, linkQuality: number, rssi: number, packetContents: Buffer) => void) | undefined

    public async run(): Promise<void> {
        // const { args, flags } = await this.parse(Sniff)
        const portConf = await getPortConf()
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`)

        this.ezsp = await emberStart(portConf)
        let exit: boolean = false

        while (!exit) {
            exit = await this.navigateMenu()

            if (exit && this.sniffing) {
                exit = await confirm({ message: 'Sniffing is currently running. Confirm exit?', default: false })
            }
        }

        this.udpSocket?.close()
        this.pcapFileStream?.close()
        await emberStop(this.ezsp)

        return this.exit(0)
    }

    private async menuStartSniffing(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error(`Invalid state, no EZSP layer available.`)
            return this.exit(1)
        }

        const enum SniffDestination {
            LOG_FILE = 0,
            WIRESHARK = 1,
            PCAP_FILE = 2,
        }
        const sniffDestination = await select({
            choices: [
                { name: 'Wireshark', value: SniffDestination.WIRESHARK, description: 'Write to Wireshark ZEP UDP Protocol' },
                { name: 'PCAP file', value: SniffDestination.PCAP_FILE, description: 'Write to a PCAP file for later use or sharing.' },
                { name: 'Log', value: SniffDestination.LOG_FILE, description: 'Write raw data to log file.' },
            ],
            message: 'Destination (Note: if present, custom handler is always used, regardless of the selected destination)',
        })

        switch (sniffDestination) {
            case SniffDestination.WIRESHARK: {
                this.wiresharkIPAddress = await input({ message: 'Wireshark IP address', default: DEFAULT_WIRESHARK_IP_ADDRESS })
                this.zepUDPPort = Number.parseInt(await input({ message: 'Wireshark ZEP UDP port', default: `${DEFAULT_ZEP_UDP_PORT}` }), 10)
                this.udpSocket = createSocket('udp4')

                this.udpSocket.bind(this.zepUDPPort)

                break
            }

            case SniffDestination.PCAP_FILE: {
                const pcapFilePath = await browseToFile('PCAP file', DEFAULT_PCAP_PATH, true)
                this.pcapFileStream = createWriteStream(pcapFilePath, 'utf8')

                this.pcapFileStream.on('error', (error) => {
                    logger.error(error)

                    return true
                })

                const fileHeader = createPcapFileHeader(PCAP_MAGIC_NUMBER_MS)

                this.pcapFileStream.write(fileHeader)

                break
            }
        }

        // set desired tx power before scan
        const radioTxPower = Number.parseInt(
            await input({
                default: '5',
                message: 'Radio transmit power [-128-127]',
                validate(value: string) {
                    if (/\./.test(value)) {
                        return false
                    }

                    const v = Number.parseInt(value, 10)

                    return v >= -128 && v <= 127
                },
            }),
            10,
        )

        let status = await this.ezsp.ezspSetRadioPower(radioTxPower)

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set transmit power to ${radioTxPower} status=${SLStatus[status]}.`)
            return true
        }

        const channel = await select<number>({
            choices: ZSpec.ALL_802_15_4_CHANNELS.map((c) => ({ name: c.toString(), value: c })),
            message: 'Channel to sniff',
        })
        const eui64 = await this.ezsp.ezspGetEui64()
        const deviceId = Number.parseInt(eui64.slice(-4), 16)

        status = await this.ezsp.mfglibInternalStart(true)

        if (status !== SLStatus.OK) {
            logger.error(`Failed to start listening for packets with status=${SLStatus[status]}.`)
            return true
        }

        status = await this.ezsp.mfglibInternalSetChannel(channel)

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set channel with status=${SLStatus[status]}.`)
            return true
        }

        this.sniffing = true

        const handlerFile = join(DATA_FOLDER, `ezspMfglibRxHandler.mjs`)

        if (existsSync(handlerFile)) {
            try {
                const importedScript = await import(pathToFileURL(handlerFile).toString())

                if (typeof importedScript.default !== 'function') {
                    throw new TypeError(`Not a function.`)
                }

                this.customHandler = importedScript.default

                logger.info(`Loaded custom handler.`)
            } catch (error) {
                logger.error(`Failed to load custom handler. ${error}`)
            }
        }

        // XXX: this is currently not restored, but not a problem since only possible menu is exit
        const ezspMfglibRxHandlerOriginal = this.ezsp.ezspMfglibRxHandler

        this.ezsp.ezspMfglibRxHandler = (linkQuality: number, rssi: number, packetContents: Buffer): void => {
            if (this.customHandler) {
                this.customHandler(this, logger, linkQuality, rssi, packetContents)
            }

            switch (sniffDestination) {
                case SniffDestination.WIRESHARK: {
                    try {
                        const wsZEPFrame = createWiresharkZEPFrame(channel, deviceId, linkQuality, rssi, this.sequence, packetContents)
                        this.sequence += 1

                        if (this.sequence > 0xffffffff) {
                            // wrap if necessary...
                            this.sequence = 0
                        }

                        if (this.udpSocket) {
                            this.udpSocket.send(wsZEPFrame, this.zepUDPPort, this.wiresharkIPAddress)
                        }
                    } catch (error) {
                        logger.debug(error)
                    }

                    break
                }

                case SniffDestination.PCAP_FILE: {
                    if (this.pcapFileStream) {
                        // fix static CRC used in EZSP >= v8
                        packetContents.set(computeCRC16CITTKermit(packetContents.subarray(0, -2)), packetContents.length - 2)

                        const packet = createPcapPacketRecordMs(packetContents)

                        this.pcapFileStream.write(packet)
                    }

                    break
                }

                case SniffDestination.LOG_FILE: {
                    ezspMfglibRxHandlerOriginal(linkQuality, rssi, packetContents)

                    break
                }
            }
        }

        logger.info(`Sniffing started.`)

        return false
    }

    private async navigateMenu(): Promise<boolean> {
        const answer = await select<-1 | SniffMenu>({
            choices: [
                { name: 'Start sniffing', value: SniffMenu.START_SNIFFING, disabled: this.sniffing },
                { name: 'Exit', value: -1 },
            ],
            message: 'Menu',
        })

        switch (answer) {
            case SniffMenu.START_SNIFFING: {
                return this.menuStartSniffing()
            }
        }

        return true
    }
}
