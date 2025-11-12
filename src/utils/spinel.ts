import EventEmitter from "node:events";
import { OTRCPDriver } from "zigbee-on-host";
import { DATA_FOLDER, logger } from "../index.js";
import { Transport, TransportEvent } from "./transport.js";
import type { PortConf } from "./types.js";

const NS = { namespace: "spinel" };

export enum MinimalSpinelEvent {
    FAILED = "failed",
}

interface MinimalSpinelEventMap {
    [MinimalSpinelEvent.FAILED]: [];
}

export class MinimalSpinel extends EventEmitter<MinimalSpinelEventMap> {
    public readonly driver: OTRCPDriver;
    private readonly transport: Transport;

    constructor(portConf: PortConf) {
        super();

        this.driver = new OTRCPDriver(
            {
                onFatalError: () => {},
                onMACFrame: () => {},
                onFrame: () => {},
                onGPFrame: () => {},
                onDeviceJoined: () => {},
                onDeviceRejoined: () => {},
                onDeviceLeft: () => {},
                onDeviceAuthorized: () => {},
            },
            // @ts-expect-error none of these params are needed for this minimal use
            {},
            {},
            DATA_FOLDER,
        );
        this.transport = new Transport(portConf);

        this.transport.on(TransportEvent.FAILED, this.onTransportFailed.bind(this));
        this.transport.on(TransportEvent.DATA, (b) => {
            logger.debug(`Received transport data: ${b.toString("hex")}.`, NS);

            this.driver.parser._transform(b, "utf8", () => {});
        });
        this.driver.parser.on("data", this.driver.onFrame.bind(this.driver));
    }

    public async start(): Promise<void> {
        await this.transport.initPort(this.driver.writer);

        this.transport.write(Buffer.from([0x7e /* HDLC FLAG */]));
    }

    public async stop(): Promise<void> {
        await this.transport.close(false);
    }

    private onTransportFailed(): void {
        this.emit(MinimalSpinelEvent.FAILED);
    }
}
