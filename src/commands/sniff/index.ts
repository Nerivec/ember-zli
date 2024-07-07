import { confirm, input, select } from '@inquirer/prompts'
import { Command } from '@oclif/core'
import { Socket, createSocket } from 'node:dgram'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Logger } from 'winston'
import { ZSpec } from 'zigbee-herdsman'
import { SLStatus } from 'zigbee-herdsman/dist/adapter/ember/enums.js'
import { Ezsp } from 'zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js'

import { DATA_FOLDER, logger } from '../../index.js'
import { emberStart, emberStop } from '../../utils/ember.js'
import { getPortConf } from '../../utils/port.js'
import { createWiresharkZEPFrame } from '../../utils/wireshark.js'

enum SniffMenu {
    START_SNIFFING = 0,
}

const DEFAULT_WIRESHARK_IP_ADDRESS = '127.0.0.1'
const DEFAULT_ZEP_UDP_PORT = 17754

export default class Sniff extends Command {
    static override args = {}
    static override description = 'Sniff Zigbee traffic (to Wireshark, to custom handler or just log in file)'
    static override examples = ['<%= config.bin %> <%= command.id %>']
    static override flags = {}

    public ezsp: Ezsp | undefined
    public sequence: number = 0
    public sniffing: boolean = false
    public udpSocket: Socket | undefined
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
        await emberStop(this.ezsp)

        return this.exit(0)
    }

    private async menuStartSniffing(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error(`Invalid state, no EZSP layer available.`)
            return this.exit(1)
        }

        const sendToWireshark = await confirm({ message: 'Send to Wireshark?', default: true })

        if (sendToWireshark) {
            this.wiresharkIPAddress = await input({ message: 'Wireshark IP address', default: DEFAULT_WIRESHARK_IP_ADDRESS })
            this.zepUDPPort = Number.parseInt(await input({ message: 'Wireshark ZEP UDP port', default: `${DEFAULT_ZEP_UDP_PORT}` }), 10)
            this.udpSocket = createSocket('udp4')

            this.udpSocket.bind(this.zepUDPPort)
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

        const channelChoices: { name: string; value: number }[] = []

        for (const channel of ZSpec.ALL_802_15_4_CHANNELS) {
            channelChoices.push({ name: channel.toString(), value: channel })
        }

        const channel = await select<number>({
            choices: channelChoices,
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

            if (sendToWireshark) {
                try {
                    const wsZEPFrame = createWiresharkZEPFrame(channel, deviceId, linkQuality, rssi, this.sequence, packetContents)
                    this.sequence += 1

                    if (this.sequence > 4294967295) {
                        // wrap if necessary...
                        this.sequence = 0
                    }

                    // expected valid if `sendToWireshark`
                    this.udpSocket!.send(wsZEPFrame, this.zepUDPPort, this.wiresharkIPAddress)
                } catch (error) {
                    logger.debug(error)
                }
            } else if (!this.customHandler) {
                // log as debug if nothing enabled
                ezspMfglibRxHandlerOriginal(linkQuality, rssi, packetContents)
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
