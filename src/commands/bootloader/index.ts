import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { input, select } from '@inquirer/prompts'
import { Command } from '@oclif/core'
import { Presets, SingleBar } from 'cli-progress'

import { DATA_FOLDER, logger } from '../../index.js'
import { BootloaderEvent, BootloaderMenu, GeckoBootloader } from '../../utils/bootloader.js'
import { FirmwareSource, FirmwareValidation } from '../../utils/enums.js'
import { FIRMWARE_LINKS } from '../../utils/firmware-links.js'
import { getPortConf } from '../../utils/port.js'
import { AdapterModel, FirmwareVariant } from '../../utils/types.js'

const SUPPORTED_VERSIONS_REGEX = /(7\.4\.\d\.\d)|(8\.0\.\d\.\d)/
const FIRMWARE_EXT = '.gbl'

export default class Bootloader extends Command {
    static override args = {}
    static override description = 'Interact with the Gecko bootloader in the adapter.'
    static override examples = ['<%= config.bin %> <%= command.id %>']

    public async run(): Promise<void> {
        const portConf = await getPortConf()
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`)

        const adapterModelChoices: { name: string; value: AdapterModel | undefined }[] = [{ name: 'Not in this list', value: undefined }]

        for (const k of Object.keys(FIRMWARE_LINKS.recommended)) {
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

    private async navigateMenu(gecko: GeckoBootloader): Promise<boolean> {
        const answer = await select<-1 | BootloaderMenu>({
            choices: [
                { name: 'Get info', value: BootloaderMenu.INFO },
                { name: 'Update firmware', value: BootloaderMenu.UPLOAD_GBL },
                { name: 'Clear NVM3', value: BootloaderMenu.CLEAR_NVM3, disabled: gecko.adapterModel !== 'Sonoff ZBDongle-E' },
                { name: 'Exit bootloader', value: BootloaderMenu.RUN },
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

                validFirmware = await gecko.validateFirmware(firmware, SUPPORTED_VERSIONS_REGEX)

                if (validFirmware === FirmwareValidation.CANCELLED) {
                    return false
                }
            }
        }

        return gecko.navigate(answer, firmware)
    }

    private async selectFirmware(gecko: GeckoBootloader): Promise<Buffer | undefined> {
        const firmwareSource = await select<FirmwareSource>({
            choices: [
                {
                    name: 'Use pre-defined firmware (recommended or latest based on your adapter)',
                    value: FirmwareSource.PRE_DEFINED,
                    disabled: gecko.adapterModel === undefined,
                },
                { name: 'Provide URL', value: FirmwareSource.URL },
                { name: `Select file in data folder (${DATA_FOLDER})`, value: FirmwareSource.DATA_FOLDER },
            ],
            message: 'Firmware Source',
        })

        switch (firmwareSource) {
            case FirmwareSource.PRE_DEFINED: {
                // valid adapterModel since select option disabled if not
                const recommended = FIRMWARE_LINKS.recommended[gecko.adapterModel!]
                const latest = FIRMWARE_LINKS.latest[gecko.adapterModel!]
                const official = FIRMWARE_LINKS.official[gecko.adapterModel!]
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
                    ],
                    message: 'Firmware version',
                })

                // valid url from choices filtering
                return this.downloadFirmware(FIRMWARE_LINKS[firmwareVariant][gecko.adapterModel!].url!)
            }

            case FirmwareSource.URL: {
                const url = await input({
                    message: 'Enter the URL to the firmware file',
                    validate(url: string): boolean {
                        try {
                            new URL(url)
                            return true
                        } catch {
                            return false
                        }
                    },
                })

                return this.downloadFirmware(url)
            }

            case FirmwareSource.DATA_FOLDER: {
                const files = readdirSync(DATA_FOLDER)
                const fileChoices = []

                for (const file of files) {
                    if (file.endsWith(FIRMWARE_EXT)) {
                        fileChoices.push({ name: file, value: file })
                    }
                }

                if (fileChoices.length === 0) {
                    logger.error(`Found no firmware GBL file in '${DATA_FOLDER}'.`)
                    return this.exit(1)
                }

                const firmwareFile = await select<string>({
                    choices: fileChoices,
                    message: 'Firmware file',
                })

                return readFileSync(join(DATA_FOLDER, firmwareFile))
            }
        }
    }
}
