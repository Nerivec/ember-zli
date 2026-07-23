import { readFileSync } from "node:fs";
import { confirm, input, select } from "@inquirer/prompts";
import { Command, Flags } from "@oclif/core";
import { Presets, SingleBar } from "cli-progress";
import { DEFAULT_FIRMWARE_GBL_PATH, logger } from "../../index.js";
import { BOOTLOADER_RESET_METHODS, BootloaderEvent, BootloaderMenu, type BootloaderResetMethod, GeckoBootloader } from "../../utils/bootloader.js";
import { ADAPTER_MODELS, BAUDRATES, PRE_DEFINED_FIRMWARE_LINKS_URL, TCP_REGEX } from "../../utils/consts.js";
import { FirmwareValidation } from "../../utils/enums.js";
import { getPortConf } from "../../utils/port.js";
import type { AdapterModel, FirmwareLinks, FirmwareVariant, PortConf, SelectChoices } from "../../utils/types.js";
import { browseToFile, fetchJson } from "../../utils/utils.js";

const SCRIPTED_ACTIONS = ["info", "update", "clear-nvm3", "clear-app", "run"] as const;
type ScriptedAction = (typeof SCRIPTED_ACTIONS)[number];

export default class Bootloader extends Command {
    static override args = {};
    static override description = "Interact with the Gecko bootloader in the adapter.";
    static override examples = [
        "<%= config.bin %> <%= command.id %>",
        '<%= config.bin %> <%= command.id %> --port /dev/serial/by-id/usb-... --baudrate 115200 --adapter "Sonoff Dongle-PMG24" --reset dtr-rts --action update --firmware ./fw.gbl --yes',
        '<%= config.bin %> <%= command.id %> --port /dev/ttyUSB0 --adapter "Sonoff Dongle-PMG24" --reset dtr-rts --action clear-nvm3 --nvm3-size 32768 --yes',
    ];
    static override flags = {
        port: Flags.string({
            description: "Serial port path (or tcp://host:port). Enables unattended mode for the connection (no prompts).",
        }),
        baudrate: Flags.integer({
            default: 115200,
            description: `Baudrate the installed firmware runs at (with --port). One of: ${BAUDRATES.join(", ")}.`,
        }),
        flow: Flags.string({
            default: "software",
            description: "Flow control (with --port).",
            options: ["hardware", "software"],
        }),
        adapter: Flags.string({
            description: "Adapter model (skips the interactive model prompt). Required for --action clear-nvm3/clear-app.",
            options: [...ADAPTER_MODELS],
        }),
        reset: Flags.string({
            description: "How to launch the bootloader when the adapter is running firmware (skips the interactive prompt).",
            options: [...BOOTLOADER_RESET_METHODS],
        }),
        action: Flags.string({
            description: "Execute a single bootloader action without the interactive menu, then exit the bootloader.",
            options: [...SCRIPTED_ACTIONS],
        }),
        firmware: Flags.string({
            description: "Firmware file path or URL (with --action update).",
        }),
        "nvm3-size": Flags.integer({
            description: "NVM3 size in bytes (with --action clear-nvm3). One of: 32768, 40960.",
        }),
        yes: Flags.boolean({
            default: false,
            description: "Skip confirmations (required for unattended --action runs).",
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Bootloader);

        if (flags.action && !flags.yes) {
            this.error("--action requires --yes: unattended actions cannot stop for confirmation prompts.");
        }

        if (flags.action === "update" && !flags.firmware) {
            this.error("--action update requires --firmware.");
        }

        if (flags.action === "clear-nvm3" && flags["nvm3-size"] !== 32768 && flags["nvm3-size"] !== 40960) {
            this.error("--action clear-nvm3 requires --nvm3-size (32768 or 40960).");
        }

        if ((flags.action === "clear-nvm3" || flags.action === "clear-app") && !flags.adapter) {
            this.error(`--action ${flags.action} requires --adapter (used to pick the matching recovery image).`);
        }

        const portConf = flags.port ? this.makePortConf(flags.port, flags.baudrate, flags.flow) : await getPortConf();
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`);

        let adapterModel = flags.adapter as AdapterModel | undefined;

        if (adapterModel === undefined && !flags.action) {
            const adapterModelChoices: SelectChoices<AdapterModel | undefined> = [{ name: "Not in this list", value: undefined }];

            for (const model of ADAPTER_MODELS) {
                adapterModelChoices.push({ name: model, value: model });
            }

            adapterModel = await select<AdapterModel | undefined>({
                choices: adapterModelChoices,
                message: "Adapter model",
            });
        }

        const gecko = new GeckoBootloader(portConf, adapterModel, { skipConfirmations: flags.yes });
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

        await gecko.connect(flags.reset as BootloaderResetMethod | undefined);

        if (flags.action) {
            await this.runScriptedAction(gecko, flags.action as ScriptedAction, flags.firmware, flags["nvm3-size"]);
        } else {
            let exit = false;

            while (!exit) {
                exit = await this.navigateMenu(gecko);
            }
        }

        await gecko.transport.close(false);

        return this.exit(0);
    }

    private makePortConf(path: string, baudRate: number, flow: string): PortConf {
        if (!TCP_REGEX.test(path) && !BAUDRATES.includes(baudRate)) {
            this.error(`--baudrate must be one of: ${BAUDRATES.join(", ")}.`);
        }

        const rtscts = flow === "hardware";

        return { baudRate, path, rtscts, xon: !rtscts, xoff: !rtscts };
    }

    private async runScriptedAction(
        gecko: GeckoBootloader,
        action: ScriptedAction,
        firmwareSource: string | undefined,
        nvm3Size: number | undefined,
    ): Promise<void> {
        switch (action) {
            case "info": {
                await gecko.navigate(BootloaderMenu.INFO);
                break;
            }

            case "run": {
                await gecko.navigate(BootloaderMenu.RUN);
                break;
            }

            case "update": {
                // checked in run(): --action update requires --firmware
                const firmware = await this.loadFirmware(firmwareSource!);

                if (firmware === undefined || (await gecko.validateFirmware(firmware)) !== FirmwareValidation.VALID) {
                    this.error("Failed to load a valid firmware file.");
                }

                if (await gecko.navigate(BootloaderMenu.UPLOAD_GBL, firmware)) {
                    this.error("Firmware upload failed.");
                }

                await gecko.navigate(BootloaderMenu.RUN);
                break;
            }

            case "clear-nvm3":
            case "clear-app": {
                // checked in run(): these actions require --adapter
                const firmwareLinks = await fetchJson<FirmwareLinks>(PRE_DEFINED_FIRMWARE_LINKS_URL);
                const variant = action === "clear-app" ? "app_clear" : nvm3Size === 32768 ? "nvm3_32768_clear" : "nvm3_40960_clear";
                const url = firmwareLinks[variant][gecko.adapterModel!];

                if (!url) {
                    this.error(`No '${variant}' recovery image is available for ${gecko.adapterModel}.`);
                }

                const firmware = await this.downloadFirmware(url);

                if (firmware === undefined) {
                    this.error("Failed to download the recovery image.");
                }

                if (await gecko.navigate(action === "clear-app" ? BootloaderMenu.CLEAR_APP : BootloaderMenu.CLEAR_NVM3, firmware)) {
                    this.error(`${action} failed.`);
                }

                await gecko.navigate(BootloaderMenu.RUN);
                break;
            }
        }
    }

    private async loadFirmware(source: string): Promise<Buffer | undefined> {
        if (source.startsWith("http://") || source.startsWith("https://")) {
            return await this.downloadFirmware(source);
        }

        try {
            return readFileSync(source);
        } catch (error) {
            logger.error(`Failed to read firmware file ${source} with error ${error}.`);
        }

        return undefined;
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
