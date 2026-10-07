import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { confirm, select } from "@inquirer/prompts";
import { findAllDevices } from "zigbee-herdsman/dist/adapter/adapterDiscovery.js";
import { CONF_PORT_PATH, logger } from "../index.js";
import { BAUDRATES, TCP_REGEX } from "./consts.js";
import type { BaudRate, FlowControl, PortConf } from "./types.js";

async function pickBaudrate(initial?: BaudRate): Promise<BaudRate> {
    return await select({
        choices: BAUDRATES.map((b) => ({ name: b.toString(), value: b })),
        default: initial,
        message: "Adapter firmware baudrate",
    });
}

async function pickFlowCtrl(initial?: FlowControl): Promise<FlowControl> {
    return await select({
        choices: [
            { name: "Software Flow Control (rtscts=false)", value: "sw" },
            { name: "Hardware Flow Control (rtscts=true)", value: "hw" },
            { name: "No Flow Control", value: "no" },
        ],
        default: initial,
        message: "Adapter flow control",
    });
}

function getPortConfFile(): PortConf | undefined {
    if (!existsSync(CONF_PORT_PATH)) {
        return undefined;
    }

    const file = readFileSync(CONF_PORT_PATH, "utf8");
    const conf: PortConf = JSON.parse(file);

    if (!conf.path) {
        logger.error("Cached config does not include a valid path value.");
        return undefined;
    }

    return conf;
}

export const getPortConf = async (): Promise<PortConf> => {
    const portConfFile = getPortConfFile();

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

    logger.info("Scanning for adapters...");

    const allDevices = await findAllDevices();

    if (allDevices.length === 0) {
        throw new Error("No adapter found.");
    }

    const device = await select<(typeof allDevices)[number]>({
        choices: allDevices.map((d) => ({ name: `${d.name} - ${d.path}`, value: d })),
        message: "Adapter",
    });
    let baudRate = device.baudRate ?? BAUDRATES[0];
    let rtscts = device.rtscts ?? false;
    let flowCtrl: FlowControl = rtscts ? "hw" : "sw";

    if (!TCP_REGEX.test(device.path)) {
        baudRate = await pickBaudrate(baudRate);
        flowCtrl = await pickFlowCtrl(flowCtrl);
        rtscts = flowCtrl === "hw";
    }

    const conf = { baudRate, path: device.path, rtscts, xon: flowCtrl === "sw", xoff: flowCtrl === "sw" };

    try {
        writeFileSync(CONF_PORT_PATH, JSON.stringify(conf, null, 2), "utf8");
    } catch {
        logger.error(`Could not write port conf to ${CONF_PORT_PATH}.`);
    }

    return conf;
};
