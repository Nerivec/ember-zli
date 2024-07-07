import { input, select } from '@inquirer/prompts'
import { Command, Flags } from '@oclif/core'
import { Presets, SingleBar } from 'cli-progress'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { DATA_FOLDER, logger } from '../../index.js'
import { BootloaderEvent, BootloaderMenu, GeckoBootloader } from '../../utils/bootloader.js'
import { FirmwareSource, FirmwareValidation } from '../../utils/enums.js'
import { getPortConf } from '../../utils/port.js'
import { AdapterModel, FirmwareMetadata, FirmwareVersion } from '../../utils/types.js'

const SUPPORTED_VERSIONS_REGEX = /(7\.4\.\d\.\d)|(8\.0\.\d\.\d)/
const FIRMWARE_EXT = '.gbl'
const FIRMWARE_LINKS: Record<FirmwareVersion, Record<AdapterModel, FirmwareMetadata>> = {
    latest: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/aeotec-zga008/ncp-uart-hw-v7.4.3.0-aeotec-zga008-115200.gbl',
            version: '7.4.3.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/zb-gw04-1v1/ncp-uart-hw-v7.4.3.0-zb-gw04-1v1-115200.gbl',
            version: '7.4.3.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/zb-gw04-1v2/ncp-uart-hw-v7.4.3.0-zb-gw04-1v2-115200.gbl',
            version: '7.4.3.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/skyconnect/ncp-uart-hw-v7.4.3.0-skyconnect-115200.gbl',
            version: '7.4.3.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/yellow/ncp-uart-hw-v7.4.3.0-yellow-115200.gbl',
            version: '7.4.3.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/slzb-06m/ncp-uart-hw-v7.4.3.0-slzb-06m-115200.gbl',
            version: '7.4.3.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/slzb-07/ncp-uart-hw-v7.4.3.0-slzb-07-115200.gbl',
            version: '7.4.3.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/zbdonglee/ncp-uart-hw-v7.4.3.0-zbdonglee-115200.gbl',
            version: '7.4.3.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/tube0013/tube_gateways/raw/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.3/maxed_settings/tubesZB-EFR32-MGM24_NCP_7.4.3.gbl',
            version: '7.4.3.0',
        },
    },
    recommended: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/aeotec-zga008/ncp-uart-hw-v7.4.3.0-aeotec-zga008-115200.gbl',
            version: '7.4.3.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/zb-gw04-1v1/ncp-uart-hw-v7.4.1.0-zb-gw04-1v1-115200.gbl',
            version: '7.4.1.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/zb-gw04-1v2/ncp-uart-hw-v7.4.1.0-zb-gw04-1v2-115200.gbl',
            version: '7.4.1.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/skyconnect/ncp-uart-hw-v7.4.1.0-skyconnect-115200.gbl',
            version: '7.4.1.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/yellow/ncp-uart-hw-v7.4.1.0-yellow-115200.gbl',
            version: '7.4.1.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/slzb-06m/ncp-uart-hw-v7.4.1.0-slzb-06m-115200.gbl',
            version: '7.4.1.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/slzb-07/ncp-uart-hw-v7.4.1.0-slzb-07-115200.gbl',
            version: '7.4.1.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/zbdonglee/ncp-uart-hw-v7.4.1.0-zbdonglee-115200.gbl',
            version: '7.4.1.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/tube0013/tube_gateways/raw/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.1/tubesZB-EFR32-MGM24_NCP_7.4.1.gbl',
            version: '7.4.1.0',
        },
    },
}

export default class Bootloader extends Command {
    static override args = {}
    static override description = 'Interact with the Gecko bootloader in the adapter via serial.'
    static override examples = ['<%= config.bin %> <%= command.id %>']
    static override flags = {
        file: Flags.file({
            char: 'f',
            description: 'Path to a firmware file. If not provided, will be set via interactive prompt when entering relevant menu.',
            exists: true,
        }),
        forceReset: Flags.boolean({ char: 'r', default: false, description: 'Try to force reset into bootloader.' }),
    }

    public async run(): Promise<void> {
        const { flags } = await this.parse(Bootloader)
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

        await gecko.connect(flags.forceReset)

        let exit: boolean = false

        while (!exit) {
            exit = await this.navigateMenu(gecko, flags.file, portConf.baudRate)
        }

        await gecko.close(false)

        return this.exit(0)
    }

    private async downloadFirmware(url: string): Promise<Buffer> {
        try {
            const response = await fetch(url)

            if (!response.ok) {
                throw new Error(`${response.status}`)
            }

            const arrayBuffer = await response.arrayBuffer()

            return Buffer.from(arrayBuffer)
        } catch (error) {
            logger.error(`Failed to download file at '${url}' with error ${error}.`)
            return this.exit(1)
        }
    }

    private async navigateMenu(gecko: GeckoBootloader, firmwareFile: string | undefined, expectedBaudRate: number): Promise<boolean> {
        const answer = await select<-1 | BootloaderMenu>({
            choices: [
                { name: 'Get info', value: BootloaderMenu.INFO },
                { name: 'Update firmware', value: BootloaderMenu.UPLOAD_GBL },
                { name: 'Clear NVM3', value: BootloaderMenu.CLEAR_NVM3 },
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
                firmware = firmwareFile === undefined ? await this.selectFirmware(gecko) : readFileSync(firmwareFile)

                validFirmware = await gecko.validateFirmware(firmware, SUPPORTED_VERSIONS_REGEX, expectedBaudRate)

                if (validFirmware === FirmwareValidation.CANCELLED) {
                    return false
                }
            }
        }

        return gecko.navigate(answer, firmware)
    }

    private async selectFirmware(gecko: GeckoBootloader): Promise<Buffer> {
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
                const firmwareVersion = await select<FirmwareVersion>({
                    choices: [
                        { name: `Recommended (${recommended.version})`, value: 'recommended' },
                        { name: `Latest (${latest.version})`, value: 'latest' },
                    ],
                    message: 'Firmware version',
                })

                return this.downloadFirmware(FIRMWARE_LINKS[firmwareVersion][gecko.adapterModel!].url)
            }

            case FirmwareSource.URL: {
                const url = await input({
                    message: 'Enter the URL to the firmware file',
                    validate(url: string): boolean {
                        try {
                            // eslint-disable-next-line no-new
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
