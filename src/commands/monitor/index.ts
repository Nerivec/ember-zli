import { Command } from "@oclif/core";

import { SLStatus } from "zigbee-herdsman/dist/adapter/ember/enums.js";

import { logger } from "../../index.js";
import { getPortConf } from "../../utils/port.js";
import { Transport, TransportEvent } from "../../utils/transport.js";

export default class Monitor extends Command {
    static override args = {};
    static override description = "Monitor the chosen port in the console.";
    static override examples = ["<%= config.bin %> <%= command.id %>"];

    private logBuffer: Buffer = Buffer.alloc(0);

    public async run(): Promise<void> {
        const portConf = await getPortConf();
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`);

        const transport = new Transport(portConf);

        try {
            await transport.initPort();
        } catch (error) {
            logger.error(`Failed to open port: ${error}.`);

            await transport.close(false, false); // force failed below

            return this.exit(1);
        }

        logger.info("Started monitoring. Press any key to stop.");

        transport.on(TransportEvent.FAILED, () => this.exit(1));
        transport.on(TransportEvent.DATA, this.onTransportData.bind(this));

        process.stdin.setRawMode(true);
        process.stdin.resume();

        await new Promise<void>((resolve) => {
            process.stdin.once("data", () => {
                process.stdin.setRawMode(false);
                resolve();
            });
        });

        return this.exit(0);
    }

    private onTransportData(received: Buffer): void {
        // concat received to previous to ensure lines are outputted properly
        let data = Buffer.concat([this.logBuffer, received]);
        let position: number;

        while ((position = data.indexOf("\r\n")) !== -1) {
            // take everything up to '\r\n' (excluded)
            const line = data.subarray(0, position);

            // skip blank lines
            if (line.length > 0) {
                let asciiLine = line.toString("ascii");
                // append SLStatus at end of line if detected hex for it
                //   - "Join network complete: 0x18"
                //   - "Join network start: 0x0"
                // XXX: format seems pretty standard throughout the SDK, but this might create some false matches (hence leaving the hex too)
                const endStatusMatch = asciiLine.match(/ (0x\d+)$/);

                if (endStatusMatch) {
                    asciiLine += ` (${SLStatus[Number.parseInt(endStatusMatch[1], 16)]})`;
                }

                logger.info(asciiLine);
            }

            // remove the line from internal buffer (set below), this time include '\r\n'
            data = data.subarray(position + 2);
        }

        this.logBuffer = data;
    }
}
