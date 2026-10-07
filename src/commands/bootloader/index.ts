import { readFileSync } from "node:fs";
import { input, select } from "@inquirer/prompts";
import { Command } from "@oclif/core";
import { Presets, SingleBar } from "cli-progress";
import { DEFAULT_FIRMWARE_GBL_PATH, logger } from "../../index.js";
import { BootloaderEvent, BootloaderMenu, GeckoBootloader } from "../../utils/bootloader.js";
import { PRE_DEFINED_FIRMWARE_LINKS_URL } from "../../utils/consts.js";
import { FirmwareValidation } from "../../utils/enums.js";
import { getPortConf } from "../../utils/port.js";
import type { FirmwareURL, FirmwareVariant, FirmwareVariantLinks } from "../../utils/types.js";
import { browseToFile, fetchJson, metadataFromFirmwareName } from "../../utils/utils.js";

export default class Bootloader extends Command {
    static override args = {};
    static override description = "Interact with the Gecko bootloader in the adapter.";
    static override examples = ["<%= config.bin %> <%= command.id %>"];

    public async run(): Promise<void> {
        const portConf = await getPortConf();
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`);

        const gecko = new GeckoBootloader(portConf);
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

        await gecko.transport.close();

        return this.exit(0);
    }

    private async navigateMenu(gecko: GeckoBootloader): Promise<boolean> {
        const answer = await select<-1 | BootloaderMenu>({
            choices: [
                { name: "Get info", value: BootloaderMenu.INFO },
                { name: "Update firmware", value: BootloaderMenu.UPLOAD_GBL },
                {
                    name: "Recovery (https://github.com/Nerivec/silabs-firmware-recovery?tab=readme-ov-file#recovery)",
                    value: BootloaderMenu.UPLOAD_RECOVERY_GBL,
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
                firmware = await this.selectFirmware();

                validFirmware = await gecko.validateFirmware(firmware);

                if (validFirmware === FirmwareValidation.CANCELLED) {
                    return false;
                }
            }
        } else if (answer === BootloaderMenu.UPLOAD_RECOVERY_GBL) {
            const firmwareLinks = await fetchJson<FirmwareVariantLinks>(PRE_DEFINED_FIRMWARE_LINKS_URL);
            const recovery = firmwareLinks.recovery;

            if (!recovery) {
                logger.error("Unable to find recovery firmware");
                return true;
            }

            const choice = await select<string>({
                choices: Object.keys(recovery).map((name) => ({ name, value: recovery[name] })),
                message: "Adapter model",
            });

            firmware = await this.downloadFirmware(choice);
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

    private async selectFirmware(): Promise<Buffer | undefined> {
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
                },
                { name: "Provide URL", value: FirmwareSource.URL },
                { name: "Browse to file", value: FirmwareSource.FILE },
            ],
            message: "Firmware source",
        });

        switch (firmwareSource) {
            case FirmwareSource.PRE_DEFINED: {
                const firmwareLinks = await fetchJson<FirmwareVariantLinks>(PRE_DEFINED_FIRMWARE_LINKS_URL);
                // valid adapterModel since select option disabled if not
                const latest = firmwareLinks.latest;
                const preRelease = firmwareLinks.pre_release;
                const firmwareVariant = await select<FirmwareVariant>({
                    choices: [
                        {
                            name: "Latest from @Nerivec",
                            value: "latest",
                            disabled: !latest,
                        },
                        {
                            name: "Latest pre-release from @Nerivec",
                            value: "pre_release",
                            disabled: !preRelease,
                        },
                    ],
                    message: "Firmware version",
                });
                const firmwareVariantLinks = firmwareLinks[firmwareVariant];

                if (!firmwareVariantLinks) {
                    logger.error("Unable to find recovery firmware");
                    return undefined;
                }

                const firmwareUrl = await select<FirmwareURL>({
                    choices: Object.keys(firmwareVariantLinks).map((name) => {
                        try {
                            const url = firmwareVariantLinks[name];
                            const fileName = url.substring(url.lastIndexOf("/") + 1);
                            const metadata = metadataFromFirmwareName(fileName);

                            return {
                                name,
                                value: url,
                                description: `Version: ${metadata.version} | Baudrate: ${metadata.baudrate} | Variant: ${metadata.variant}`,
                            };
                        } catch (error) {
                            logger.warning(`Unable to parse firmware metadata from name: ${error}`);

                            return { name, value: firmwareVariantLinks[name] };
                        }
                    }),
                    message: "Firmware version",
                });

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
