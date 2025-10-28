import { readFileSync } from "node:fs";
import { confirm, input, select } from "@inquirer/prompts";
import { Command } from "@oclif/core";
import { Presets, SingleBar } from "cli-progress";
import { DEFAULT_FIRMWARE_GBL_PATH, logger } from "../../index.js";
import { BootloaderEvent, BootloaderMenu, GeckoBootloader } from "../../utils/bootloader.js";
import { ADAPTER_MODELS, PRE_DEFINED_FIRMWARE_LINKS_URL } from "../../utils/consts.js";
import { FirmwareValidation } from "../../utils/enums.js";
import { getPortConf } from "../../utils/port.js";
import type { AdapterModel, FirmwareLinks, FirmwareVariant, SelectChoices } from "../../utils/types.js";
import { browseToFile, fetchJson } from "../../utils/utils.js";

export default class Bootloader extends Command {
    static override args = {};
    static override description = "Interact with the Gecko bootloader in the adapter.";
    static override examples = ["<%= config.bin %> <%= command.id %>"];

    public async run(): Promise<void> {
        const portConf = await getPortConf();
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`);

        const adapterModelChoices: SelectChoices<AdapterModel | undefined> = [{ name: "Not in this list", value: undefined }];

        for (const model of ADAPTER_MODELS) {
            adapterModelChoices.push({ name: model, value: model });
        }

        const adapterModel = await select<AdapterModel | undefined>({
            choices: adapterModelChoices,
            message: "Adapter model",
        });

        const gecko = new GeckoBootloader(portConf, adapterModel);
        const progressBar = new SingleBar({ clearOnComplete: true, format: "{bar} {percentage}%" }, Presets.shades_classic);

        gecko.on(BootloaderEvent.FAILED, () => {
            this.exit(1);
        });

        gecko.on(BootloaderEvent.CLOSED, () => {
            this.exit(0);
        });

        gecko.on(BootloaderEvent.UPLOAD_START, () => {
            progressBar.start(100, 0);
        });

        gecko.on(BootloaderEvent.UPLOAD_STOP, () => {
            progressBar.stop();
        });

        gecko.on(BootloaderEvent.UPLOAD_PROGRESS, (percent) => {
            progressBar.update(percent);
        });

        await gecko.connect();

        let exit = false;

        while (!exit) {
            exit = await this.navigateMenu(gecko);
        }

        await gecko.transport.close(false);

        return this.exit(0);
    }

    private async navigateMenu(gecko: GeckoBootloader): Promise<boolean> {
        const answer = await select<-1 | BootloaderMenu>({
            choices: [
                { name: "Get info", value: BootloaderMenu.INFO },
                { name: "Update firmware", value: BootloaderMenu.UPLOAD_GBL },
                {
                    name: "Clear NVM3 (https://github.com/Nerivec/silabs-firmware-recovery?tab=readme-ov-file#nvm3-clear)",
                    value: BootloaderMenu.CLEAR_NVM3,
                    disabled: !gecko.adapterModel,
                },
                {
                    name: "Clear APP (https://github.com/Nerivec/silabs-firmware-recovery?tab=readme-ov-file#app-clear)",
                    value: BootloaderMenu.CLEAR_APP,
                    disabled: !gecko.adapterModel,
                },
                { name: "Exit bootloader (run firmware)", value: BootloaderMenu.RUN },
                { name: "Force close", value: -1 },
            ],
            message: "Menu",
        });

        if (answer === -1) {
            logger.warning("Force closing... You may need to unplug/replug the adapter.");
            return true;
        }

        let firmware: Buffer | undefined;

        if (answer === BootloaderMenu.UPLOAD_GBL) {
            let validFirmware: FirmwareValidation = FirmwareValidation.INVALID;

            while (validFirmware !== FirmwareValidation.VALID) {
                firmware = await this.selectFirmware(gecko);

                validFirmware = await gecko.validateFirmware(firmware);

                if (validFirmware === FirmwareValidation.CANCELLED) {
                    return false;
                }
            }
        } else if (answer === BootloaderMenu.CLEAR_NVM3) {
            const confirmed = await confirm({
                default: false,
                message: `Confirm adapter is: ${gecko.adapterModel}?`,
            });

            if (!confirmed) {
                logger.warning("Cancelled NVM3 clearing.");
                return false;
            }

            const nvm3Size = await select<number>({
                choices: [
                    { name: "32768", value: 32768 },
                    { name: "40960", value: 40960 },
                ],
                message: "NVM3 Size (https://github.com/Nerivec/silabs-firmware-recovery?tab=readme-ov-file#nvm3-clear)",
            });
            const firmwareLinks = await fetchJson<FirmwareLinks>(PRE_DEFINED_FIRMWARE_LINKS_URL);
            const variant = nvm3Size === 32768 ? "nvm3_32768_clear" : "nvm3_40960_clear";
            firmware = await this.downloadFirmware(firmwareLinks[variant][gecko.adapterModel!]!);
        } else if (answer === BootloaderMenu.CLEAR_APP) {
            const confirmed = await confirm({
                default: false,
                message: `Confirm adapter is: ${gecko.adapterModel}?`,
            });

            if (!confirmed) {
                logger.warning("Cancelled APP clearing.");
                return false;
            }

            const firmwareLinks = await fetchJson<FirmwareLinks>(PRE_DEFINED_FIRMWARE_LINKS_URL);
            firmware = await this.downloadFirmware(firmwareLinks.app_clear[gecko.adapterModel!]!);
        }

        return await gecko.navigate(answer, firmware);
    }

    private async downloadFirmware(url: string): Promise<Buffer | undefined> {
        try {
            logger.info(`Downloading firmware from ${url}.`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            return Buffer.from(arrayBuffer);
        } catch (error) {
            logger.error(`Failed to download firmware file from ${url} with error ${error}.`);
        }

        return undefined;
    }

    private async selectFirmware(gecko: GeckoBootloader): Promise<Buffer | undefined> {
        enum FirmwareSource {
            PRE_DEFINED = 0,
            URL = 1,
            FILE = 2,
        }
        const firmwareSource = await select<FirmwareSource>({
            choices: [
                {
                    name: `Use pre-defined firmware (using ${PRE_DEFINED_FIRMWARE_LINKS_URL})`,
                    value: FirmwareSource.PRE_DEFINED,
                    disabled: gecko.adapterModel === undefined,
                },
                { name: "Provide URL", value: FirmwareSource.URL },
                { name: "Browse to file", value: FirmwareSource.FILE },
            ],
            message: "Firmware source",
        });

        switch (firmwareSource) {
            case FirmwareSource.PRE_DEFINED: {
                const firmwareLinks = await fetchJson<FirmwareLinks>(PRE_DEFINED_FIRMWARE_LINKS_URL);
                // valid adapterModel since select option disabled if not
                const official = firmwareLinks.official[gecko.adapterModel!];
                const darkxst = firmwareLinks.darkxst[gecko.adapterModel!];
                const nerivec = firmwareLinks.nerivec[gecko.adapterModel!];
                const nerivecPreRelease = firmwareLinks.nerivec_pre_release[gecko.adapterModel!];
                const firmwareVariant = await select<FirmwareVariant>({
                    choices: [
                        {
                            name: "Latest from manufacturer",
                            value: "official",
                            description: official,
                            disabled: !official,
                        },
                        {
                            name: "Latest from @darkxst",
                            value: "darkxst",
                            description: darkxst,
                            disabled: !darkxst,
                        },
                        {
                            name: "Latest from @Nerivec",
                            value: "nerivec",
                            description: nerivec,
                            disabled: !nerivec,
                        },
                        {
                            name: "Latest pre-release from @Nerivec",
                            value: "nerivec_pre_release",
                            description: nerivecPreRelease,
                            disabled: !nerivecPreRelease,
                        },
                    ],
                    message: "Firmware version",
                });
                const firmwareUrl = firmwareLinks[firmwareVariant][gecko.adapterModel!];

                // just in case (and to pass linter)
                if (!firmwareUrl) {
                    return undefined;
                }

                return await this.downloadFirmware(firmwareUrl);
            }

            case FirmwareSource.URL: {
                const url = await input({
                    message: "Enter the URL to the firmware file",
                    validate(value) {
                        try {
                            new URL(value);
                            return true;
                        } catch {
                            return false;
                        }
                    },
                });

                return await this.downloadFirmware(url);
            }

            case FirmwareSource.FILE: {
                const firmwareFile = await browseToFile("Firmware file", DEFAULT_FIRMWARE_GBL_PATH);

                return readFileSync(firmwareFile);
            }
        }
    }
}
