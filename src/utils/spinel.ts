import EventEmitter from "node:events";
import { AdapterTransport } from "zigbee-herdsman/dist/adapter/transport.js";
import { OTRCPDriver } from "zigbee-on-host";
import { DATA_FOLDER } from "../index.js";
import type { PortConf } from "./types.js";

export enum MinimalSpinelEvent {
    FAILED = "failed",
}

interface MinimalSpinelEventMap {
    [MinimalSpinelEvent.FAILED]: [];
}

export class MinimalSpinel extends EventEmitter<MinimalSpinelEventMap> {
    public readonly driver: OTRCPDriver;
    private readonly transport: AdapterTransport;

    constructor(portConf: PortConf) {
        super();

        this.transport = new AdapterTransport(portConf);
        this.driver = new OTRCPDriver(
            this.transport,
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

        this.transport.on("close", () => {
            this.emit(MinimalSpinelEvent.FAILED);
        });
    }

    public async start(): Promise<void> {
        await this.transport.open();

        this.transport.write(Buffer.from([0x7e /* HDLC FLAG */]));
    }

    public async stop(): Promise<void> {
        await this.transport.close();
    }
}
