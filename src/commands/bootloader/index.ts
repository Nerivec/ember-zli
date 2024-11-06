import type { AdapterModel, FirmwareVariant, SelectChoices } from '../../utils/types.js'

import { readFileSync } from 'node:fs'

import { input, select } from '@inquirer/prompts'
import { Command } from '@oclif/core'
import { Presets, SingleBar } from 'cli-progress'

import { DEFAULT_FIRMWARE_GBL_PATH, logger } from '../../index.js'
import { BootloaderEvent, BootloaderMenu, GeckoBootloader } from '../../utils/bootloader.js'
import { FirmwareValidation } from '../../utils/enums.js'
import { FIRMWARE_LINKS } from '../../utils/firmware-links.js'
import { getPortConf } from '../../utils/port.js'
import { browseToFile } from '../../utils/utils.js'

const clearNVM3SonoffZBDongleE: () => Buffer = () => {
    const start = 'eb17a603080000000000000300000000f40a0af41c00000000000000000000000000000000000000000000000000000000000000fd0303fd0480000000600b00'
    const blankChunkStart = '01009ab2010000d0feffff0fffffffff0098'
    const blankChunkLength = 8174
    const end = 'fc0404fc040000004b83c4aa'

    return Buffer.concat([
        Buffer.from(start, 'hex'),
        Buffer.from(blankChunkStart, 'hex'),
        Buffer.alloc(blankChunkLength, 0xff),
        Buffer.from(blankChunkStart, 'hex'),
        Buffer.alloc(blankChunkLength, 0xff),
        Buffer.from(blankChunkStart, 'hex'),
        Buffer.alloc(blankChunkLength, 0xff),
        Buffer.from(blankChunkStart, 'hex'),
        Buffer.alloc(blankChunkLength, 0xff),
        Buffer.from(end, 'hex'),
    ])
}

const CLEAR_NVM3_BUFFERS: Partial<Record<AdapterModel, () => Buffer>> = {
    'Sonoff ZBDongle-E': clearNVM3SonoffZBDongleE,
    'Sonoff ZBDongle-E - ROUTER': clearNVM3SonoffZBDongleE,
}

export default class Bootloader extends Command {
    static override args = {}
    static override description = 'Interact with the Gecko bootloader in the adapter.'
    static override examples = ['<%= config.bin %> <%= command.id %>']

    public async run(): Promise<void> {
        const portConf = await getPortConf()
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`)

        const adapterModelChoices: SelectChoices<AdapterModel | undefined> = [{ name: 'Not in this list', value: undefined }]

        for (const k in FIRMWARE_LINKS.recommended) {
            adapterModelChoices.push({ name: k, value: k as AdapterModel })
        }

        const adapterModel = await select<AdapterModel | undefined>({
            choices: adapterModelChoices,
            message: 'Adapter model',
        })

        const gecko = new GeckoBootloader(portConf, adapterModel)
        const progressBar = new SingleBar({ clearOnComplete: true, format: '{bar} {percentage}%' }, Presets.shades_classic)

        gecko.on(BootloaderEvent.FAILED, () => {
            this.exit(1)
        })

        gecko.on(BootloaderEvent.CLOSED, () => {
            this.exit(0)
        })

        gecko.on(BootloaderEvent.UPLOAD_START, () => {
            progressBar.start(100, 0)
        })

        gecko.on(BootloaderEvent.UPLOAD_STOP, () => {
            progressBar.stop()
        })

        gecko.on(BootloaderEvent.UPLOAD_PROGRESS, (percent) => {
            progressBar.update(percent)
        })

        await gecko.connect()

        let exit: boolean = false

        while (!exit) {
            exit = await this.navigateMenu(gecko)
        }

        await gecko.transport.close(false)

        return this.exit(0)
    }

    private async navigateMenu(gecko: GeckoBootloader): Promise<boolean> {
        const answer = await select<-1 | BootloaderMenu>({
            choices: [
                { name: 'Get info', value: BootloaderMenu.INFO },
                { name: 'Update firmware', value: BootloaderMenu.UPLOAD_GBL },
                { name: 'Clear NVM3', value: BootloaderMenu.CLEAR_NVM3, disabled: !this.supportsClearNVM3(gecko.adapterModel) },
                { name: 'Exit bootloader (run firmware)', value: BootloaderMenu.RUN },
                { name: 'Force close', value: -1 },
            ],
            message: 'Menu',
        })

        if (answer === -1) {
            logger.warning(`Force closing... You may need to unplug/replug the adapter.`)
            return true
        }

        let firmware: Buffer | undefined = undefined

        if (answer === BootloaderMenu.UPLOAD_GBL) {
            let validFirmware: FirmwareValidation = FirmwareValidation.INVALID

            while (validFirmware !== FirmwareValidation.VALID) {
                firmware = await this.selectFirmware(gecko)

                validFirmware = await gecko.validateFirmware(firmware)

                if (validFirmware === FirmwareValidation.CANCELLED) {
                    return false
                }
            }
        } else if (answer === BootloaderMenu.CLEAR_NVM3) {
            // adapterModel is defined here since menu is disabled if not supported, same for the value in the object
            firmware = CLEAR_NVM3_BUFFERS[gecko.adapterModel!]!()
        }

        return await gecko.navigate(answer, firmware)
    }

    private async downloadFirmware(url: string): Promise<Buffer | undefined> {
        try {
            logger.info(`Downloading firmware from ${url}.`)

            const response = await fetch(url)

            if (!response.ok) {
                throw new Error(`${response.status}`)
            }

            const arrayBuffer = await response.arrayBuffer()

            return Buffer.from(arrayBuffer)
        } catch (error) {
            logger.error(`Failed to download firmware file from ${url} with error ${error}.`)
        }

        return undefined
    }

    private async selectFirmware(gecko: GeckoBootloader): Promise<Buffer | undefined> {
        const enum FirmwareSource {
            PRE_DEFINED = 0,
            URL = 1,
            FILE = 2,
        }
        const firmwareSource = await select<FirmwareSource>({
            choices: [
                {
                    name: 'Use pre-defined firmware (recommended or latest based on your adapter)',
                    value: FirmwareSource.PRE_DEFINED,
                    disabled: gecko.adapterModel === undefined,
                },
                { name: 'Provide URL', value: FirmwareSource.URL },
                { name: `Browse to file`, value: FirmwareSource.FILE },
            ],
            message: 'Firmware Source',
        })

        switch (firmwareSource) {
            case FirmwareSource.PRE_DEFINED: {
                // valid adapterModel since select option disabled if not
                const recommended = FIRMWARE_LINKS.recommended[gecko.adapterModel!]
                const latest = FIRMWARE_LINKS.latest[gecko.adapterModel!]
                const official = FIRMWARE_LINKS.official[gecko.adapterModel!]
                const experimental = FIRMWARE_LINKS.experimental[gecko.adapterModel!]
                const firmwareVariant = await select<FirmwareVariant>({
                    choices: [
                        {
                            name: `Recommended for Zigbee2MQTT`,
                            value: 'recommended',
                            description: recommended.url
                                ? `Version: ${recommended.version}, RTS/CTS: ${recommended.settings.rtscts}, URL: ${recommended.url}`
                                : undefined,
                            disabled: !recommended.url,
                        },
                        {
                            name: `Latest`,
                            value: 'latest',
                            description: latest.url
                                ? `Version: ${latest.version}, RTS/CTS: ${latest.settings.rtscts}, URL: ${latest.url}`
                                : undefined,
                            disabled: !latest.url,
                        },
                        {
                            name: `Latest from manufacturer`,
                            value: 'official',
                            description: official.url
                                ? `Version: ${official.version}, RTS/CTS: ${official.settings.rtscts}, URL: ${official.url}`
                                : undefined,
                            disabled: !official.url,
                        },
                        {
                            name: `Experimental`,
                            value: 'experimental',
                            description: experimental.url
                                ? `Version: ${experimental.version}, RTS/CTS: ${experimental.settings.rtscts}, URL: ${experimental.url}`
                                : undefined,
                            disabled: !experimental.url,
                        },
                    ],
                    message: 'Firmware version',
                })

                // valid url from choices filtering
                return await this.downloadFirmware(FIRMWARE_LINKS[firmwareVariant][gecko.adapterModel!].url!)
            }

            case FirmwareSource.URL: {
                const url = await input({
                    message: 'Enter the URL to the firmware file',
                    validate(value) {
                        try {
                            new URL(value)
                            return true
                        } catch {
                            return false
                        }
                    },
                })

                return await this.downloadFirmware(url)
            }

            case FirmwareSource.FILE: {
                const firmwareFile = await browseToFile('Firmware file', DEFAULT_FIRMWARE_GBL_PATH)

                return readFileSync(firmwareFile)
            }
        }
    }

    private supportsClearNVM3(adapterModel?: AdapterModel): boolean {
        if (!adapterModel) {
            return false
        }

        for (const key in CLEAR_NVM3_BUFFERS) {
            if (key === adapterModel) {
                return true
            }
        }

        return false
    }
}
