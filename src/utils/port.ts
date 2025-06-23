import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { confirm, input, select } from "@inquirer/prompts";
import { Bonjour } from "bonjour-service";
import { SerialPort } from "zigbee-herdsman/dist/adapter/serialPort.js";
import { CONF_PORT_PATH, logger } from "../index.js";
import { BAUDRATES, TCP_REGEX } from "./consts.js";
import type { BaudRate, PortConf, PortType, SelectChoices } from "./types.js";

async function findmDNSAdapters(): Promise<SelectChoices<string | undefined>> {
    logger.info("Starting mDNS discovery...");

    const bonjour = new Bonjour();
    const adapters: SelectChoices<string | undefined> = [{ name: "Not in this list", value: undefined }];
    const browser = bonjour.find(null, (service) => {
        if (service.txt && service.txt.radio_type === "ezsp") {
            logger.debug(`Found matching service: ${JSON.stringify(service)}`);

            const path = `tcp://${service.addresses?.[0] ?? service.host}:${service.port}`;

            adapters.push({ name: `${service.name ?? service.txt.name ?? "Unknown"} (${path})`, value: path });
        }
    });

    browser.start();

    return await new Promise((resolve) => {
        setTimeout(() => {
            browser.stop();
            bonjour.destroy();
            resolve(adapters);
        }, 2000);
    });
}

export const getPortConfFile = async (): Promise<PortConf | undefined> => {
    if (!existsSync(CONF_PORT_PATH)) {
        return undefined;
    }

    const file = readFileSync(CONF_PORT_PATH, "utf8");
    const conf: PortConf = JSON.parse(file);

    if (!conf.path) {
        logger.error("Cached config does not include a valid path value.");
        return undefined;
    }

    if (!TCP_REGEX.test(conf.path)) {
        // serial-only validation
        if (!conf.baudRate || !BAUDRATES.includes(conf.baudRate)) {
            logger.error("Cached config does not include a valid baudrate value.");
            return undefined;
        }

        const portList = await SerialPort.list();

        if (portList.length === 0) {
            logger.error("Cached config is using serial, no serial device currently connected.");
            return undefined;
        }

        if (!portList.some((p) => p.path === conf.path)) {
            logger.error("Cached config path does not match a currently connected serial device.");
            return undefined;
        }

        if (conf.rtscts !== true && conf.rtscts !== false) {
            logger.error("Cached config does not include a valid rtscts value.");
            return undefined;
        }

        if (conf.xon !== true && conf.xon !== false) {
            conf.xon = !conf.rtscts;
            logger.debug(`Cached config does not include a valid xon value. Derived from rtscts (will be ${conf.xon}).`);
        }

        if (conf.xoff !== true && conf.xoff !== false) {
            conf.xoff = !conf.rtscts;
            logger.debug(`Cached config does not include a valid xoff value. Derived from rtscts (will be ${conf.xoff}).`);
        }
    }

    return conf;
};

export const getPortConf = async (): Promise<PortConf> => {
    const portConfFile = await getPortConfFile();

    if (portConfFile !== undefined) {
        const isTcp = TCP_REGEX.test(portConfFile.path);
        const usePortConfFile = await confirm({
            default: true,
            message: `Path: ${portConfFile.path}${isTcp ? "" : `, Baudrate: ${portConfFile.baudRate}, RTS/CTS: ${portConfFile.rtscts}`}. Use this config?`,
        });

        if (usePortConfFile) {
            return portConfFile;
        }
    }

    const type = await select<PortType>({
        choices: [
            { name: "Serial", value: "serial" },
            { name: "TCP", value: "tcp" },
        ],
        message: "Adapter connection type",
    });

    let baudRate = BAUDRATES[0];
    let path = null;
    let rtscts = false;

    switch (type) {
        case "serial": {
            const baudrateChoices = [];

            for (const v of BAUDRATES) {
                baudrateChoices.push({ name: v.toString(), value: v });
            }

            baudRate = await select<BaudRate>({
                choices: baudrateChoices,
                message: "Adapter firmware baudrate",
            });

            const portList = await SerialPort.list();

            if (portList.length === 0) {
                throw new Error("No serial device found.");
            }

            path = await select<string>({
                choices: portList.map((p) => ({
                    // @ts-expect-error friendlyName windows only
                    name: `${p.manufacturer} ${p.friendlyName ?? ""} ${p.pnpId} (${p.path})`,
                    value: p.path,
                })),
                message: "Serial port",
            });

            const fcChoices = [
                { name: "Software Flow Control (rtscts=false)", value: false },
                { name: "Hardware Flow Control (rtscts=true)", value: true },
            ];
            rtscts = await select<boolean>({
                choices: fcChoices,
                message: "Flow control",
            });

            break;
        }

        case "tcp": {
            const discover = await confirm({ message: "Try to discover adapter?", default: true });

            if (discover) {
                const choices = await findmDNSAdapters();

                path = await select({ message: "Select adapter", choices });
            }

            if (!discover || !path) {
                path = await input({
                    message: `TCP path ('tcp://<host>:<port>')`,
                    validate(value) {
                        return TCP_REGEX.test(value);
                    },
                });
            }

            break;
        }
    }

    if (!path) {
        throw new Error("Invalid port path.");
    }

    const conf = { baudRate, path, rtscts, xon: !rtscts, xoff: !rtscts };

    try {
        writeFileSync(CONF_PORT_PATH, JSON.stringify(conf, null, 2), "utf8");
    } catch {
        logger.error(`Could not write port conf to ${CONF_PORT_PATH}.`);
    }

    return conf;
};
