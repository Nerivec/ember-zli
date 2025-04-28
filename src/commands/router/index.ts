import type {
    EmberApsFrame,
    EmberInitialSecurityState,
    EmberMulticastId,
    EmberMulticastTableEntry,
    EmberZigbeeNetwork,
} from "zigbee-herdsman/dist/adapter/ember/types.js";
import type { Eui64, NodeId, PanId } from "zigbee-herdsman/dist/zspec/tstypes.js";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { Command } from "@oclif/core";
import { Presets, SingleBar } from "cli-progress";
import type { Logger } from "winston";

import { ZSpec, Zcl, Zdo } from "zigbee-herdsman";
import { DEFAULT_STACK_CONFIG } from "zigbee-herdsman/dist/adapter/ember/adapter/emberAdapter.js";
import { EmberTokensManager } from "zigbee-herdsman/dist/adapter/ember/adapter/tokensManager.js";
import { EMBER_MIN_BROADCAST_ADDRESS, STACK_PROFILE_ZIGBEE_PRO } from "zigbee-herdsman/dist/adapter/ember/consts.js";
import {
    type EmberApsOption,
    EmberCounterType,
    EmberExtendedSecurityBitmask,
    EmberIncomingMessageType,
    EmberInitialSecurityBitmask,
    EmberJoinMethod,
    EmberNodeType,
    EmberOutgoingMessageType,
    EzspNetworkScanType,
    EzspStatus,
    SLStatus,
} from "zigbee-herdsman/dist/adapter/ember/enums.js";
import type { Ezsp } from "zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js";
import type { DataType } from "zigbee-herdsman/dist/zspec/zcl/index.js";
import { BuffaloZdo } from "zigbee-herdsman/dist/zspec/zdo/buffaloZdo.js";

import { DATA_FOLDER, DEFAULT_ROUTER_SCRIPT_MJS_PATH, DEFAULT_ROUTER_TOKENS_BACKUP_PATH, logger } from "../../index.js";
import { APPLICATION_ZDO_SEQUENCE_MASK, DEFAULT_APS_OPTIONS, DEFAULT_ZDO_REQUEST_RADIUS } from "../../utils/consts.js";
import {
    emberFullVersion,
    emberNetworkConfig,
    emberNetworkInit,
    emberRegisterFixedEndpoints,
    emberSetConcentrator,
    emberStart,
    emberStop,
    waitForStackStatus,
} from "../../utils/ember.js";
import { getPortConf } from "../../utils/port.js";
import { ROUTER_FIXED_ENDPOINTS } from "../../utils/router-endpoints.js";
import { browseToFile, loadStackConfig, toHex } from "../../utils/utils.js";

type CustomEventHandlers = {
    onIncomingMessage?: (
        cmd: Command,
        logger: Logger,
        type: EmberIncomingMessageType,
        apsFrame: EmberApsFrame,
        lastHopLqi: number,
        sender: NodeId,
        messageContents: Buffer,
    ) => Promise<void>;
    onMessageSent?: (
        cmd: Command,
        logger: Logger,
        status: SLStatus,
        type: EmberOutgoingMessageType,
        indexOrDestination: number,
        apsFrame: EmberApsFrame,
        messageTag: number,
    ) => Promise<void>;
    onStackStatus?: (cmd: Command, logger: Logger, status: SLStatus) => Promise<void>;
    onTouchlinkMessage?: (
        cmd: Command,
        logger: Logger,
        sourcePanId: PanId,
        sourceAddress: Eui64,
        groupId: null | number,
        lastHopLqi: number,
        messageContents: Buffer,
    ) => Promise<void>;
    onZDOResponse?: (cmd: Command, logger: Logger, apsFrame: EmberApsFrame, sender: NodeId, messageContents: Buffer) => Promise<void>;
};

enum RouterMenu {
    NETWORK_JOIN = 0,
    NETWORK_REJOIN = 1,
    NETWORK_LEAVE = 2,
    NETWORK_INFO = 5,

    TOKENS_BACKUP = 10,
    TOKENS_RESTORE = 11,
    TOKENS_RESET = 12,

    READ_COUNTERS = 20,

    SET_MANUFACTURER_CODE = 50,

    PING_COORDINATOR = 90,
    RELOAD_EVENT_HANDLERS = 98,
    RUN_SCRIPT = 99,
}

enum RouterState {
    UNKNOWN = 0,
    NOT_JOINED = 1,
    RUNNING = 2,
}

export default class Router extends Command {
    static override args = {};
    static override description = "Use a coordinator firmware as a router and interact with the joined network.";
    static override examples = ["<%= config.bin %> <%= command.id %>"];
    static override flags = {};

    public ezsp: Ezsp | undefined;
    public multicastTable: EmberMulticastId[] = [];
    public routerState: RouterState = RouterState.UNKNOWN;

    private customEventHandlers: CustomEventHandlers = {
        onIncomingMessage: undefined,
        onMessageSent: undefined,
        onStackStatus: undefined,
        onTouchlinkMessage: undefined,
        onZDOResponse: undefined,
    };

    private manufacturerCode: Zcl.ManufacturerCode = Zcl.ManufacturerCode.SILICON_LABORATORIES;
    private stackConfig: typeof DEFAULT_STACK_CONFIG = DEFAULT_STACK_CONFIG;
    private zdoRequestSequence = 0;

    public async run(): Promise<void> {
        // const {flags} = await this.parse(Router)
        const portConf = await getPortConf();
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`);

        this.ezsp = await emberStart(portConf);

        this.ezsp.on("ncpNeedsResetAndInit", (status: EzspStatus): void => {
            logger.error(`Adapter needs restarting: status=${EzspStatus[status]}`);

            this.exit(1);
        });
        this.ezsp.on("incomingMessage", this.onIncomingMessage.bind(this));
        this.ezsp.on("messageSent", this.onMessageSent.bind(this));
        this.ezsp.on("stackStatus", this.onStackStatus.bind(this));
        this.ezsp.on("touchlinkMessage", this.onTouchlinkMessage.bind(this));
        this.ezsp.on("zdoResponse", this.onZDOResponse.bind(this));

        await this.loadCustomEventHandlers();

        this.stackConfig = loadStackConfig();

        await emberNetworkConfig(this.ezsp, this.stackConfig, this.manufacturerCode);
        await emberRegisterFixedEndpoints(this.ezsp, this.multicastTable /* IN/OUT */, true);

        let exit = false;

        while (!exit) {
            exit = await this.navigateMenu();

            if (exit && this.routerState === RouterState.RUNNING) {
                exit = await confirm({ message: "Router is currently running. Confirm exit?", default: false });
            }
        }

        await emberStop(this.ezsp);

        return this.exit(0);
    }

    private async loadCustomEventHandlers(): Promise<void> {
        for (const handler in this.customEventHandlers) {
            const handlerFile = join(DATA_FOLDER, `${handler}.mjs`);

            if (existsSync(handlerFile)) {
                try {
                    const importedScript = await import(pathToFileURL(handlerFile).toString());

                    if (typeof importedScript.default !== "function") {
                        throw new TypeError("Not a function.");
                    }

                    this.customEventHandlers[handler as keyof CustomEventHandlers] = importedScript.default;

                    logger.info(`Loaded custom handler for '${handler}'.`);
                } catch (error) {
                    logger.error(`Failed to load custom handler for '${handler}'. ${error}`);
                }
            }
        }
    }

    private async menuNetworkInfo(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        const [npStatus, nodeType, netParams] = await this.ezsp.ezspGetNetworkParameters();

        if (npStatus !== SLStatus.OK) {
            logger.error(`Failed to get network parameters with status=${SLStatus[npStatus]}.`);
            return true;
        }

        const eui64 = await this.ezsp.ezspGetEui64();
        const nodeId = await this.ezsp.ezspGetNodeId();

        logger.info(`Node ID=${toHex(nodeId)}/${nodeId} EUI64=${eui64} type=${EmberNodeType[nodeType]}.`);
        logger.info("Network parameters:");
        logger.info(`  - PAN ID: ${netParams.panId} (${toHex(netParams.panId)})`);
        logger.info(`  - Extended PAN ID: ${netParams.extendedPanId}`);
        logger.info(`  - Radio Channel: ${netParams.radioChannel}`);
        logger.info(`  - Radio Power: ${netParams.radioTxPower} dBm`);
        logger.info(`  - Preferred Channels: ${ZSpec.Utils.uint32MaskToChannels(netParams.channels).join(",")}`);

        return false;
    }

    private async menuNetworkJoin(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        let status = await emberNetworkInit(this.ezsp, true);
        const notJoined = status === SLStatus.NOT_JOINED;

        this.setRouterState(notJoined ? RouterState.NOT_JOINED : RouterState.UNKNOWN);

        if (!notJoined && status !== SLStatus.OK) {
            logger.error(`Failed network init request with status=${SLStatus[status]}.`);
            return true;
        }

        if (!notJoined) {
            const overwrite = await confirm({ default: false, message: "A network is present in the adapter. Leave and continue join?" });

            if (!overwrite) {
                logger.info("Join cancelled.");
                return false;
            }

            const status = await this.ezsp.ezspLeaveNetwork();

            if (status !== SLStatus.OK) {
                logger.error(`Failed to leave network with status=${SLStatus[status]}.`);
                return true;
            }

            await waitForStackStatus(this.ezsp, SLStatus.NETWORK_DOWN);
        }

        // set desired tx power before scan
        const radioTxPower = Number.parseInt(
            await input({
                default: "5",
                message: "Radio transmit power [-128-127]",
                validate(value) {
                    if (/\./.test(value)) {
                        return false;
                    }

                    const v = Number.parseInt(value, 10);

                    return v >= -128 && v <= 127;
                },
            }),
            10,
        );

        status = await this.ezsp.ezspSetRadioPower(radioTxPower);

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set transmit power to '${radioTxPower}' status=${SLStatus[status]}.`);
            return true;
        }

        const channels = await checkbox<number>({
            choices: ZSpec.ALL_802_15_4_CHANNELS.map((c) => ({
                name: c.toString(),
                value: c,
                checked: ZSpec.PREFERRED_802_15_4_CHANNELS.includes(c),
            })),
            message: "Channels to scan",
            required: true,
        });

        const progressBar = new SingleBar({ clearOnComplete: true, format: "{bar} {percentage}% | ETA: {eta}s" }, Presets.shades_classic);
        const duration = 4;
        // a symbol is 16 microseconds, a scan period is 960 symbols
        const totalTime = (((2 ** duration + 1) * (16 * 960)) / 1000) * channels.length;
        let scanCompleted: (value: PromiseLike<void> | void) => void;
        const joinableNetworks: { networkFound: EmberZigbeeNetwork; lastHopLqi: number; lastHopRssi: number }[] = [];
        // NOTE: expanding zigbee-herdsman
        const ezspNetworkFoundHandlerOriginal = this.ezsp.ezspNetworkFoundHandler;
        const ezspScanCompleteHandlerOriginal = this.ezsp.ezspScanCompleteHandler;

        this.ezsp.ezspNetworkFoundHandler = (networkFound: EmberZigbeeNetwork, lastHopLqi: number, lastHopRssi: number): void => {
            logger.debug(`ezspNetworkFoundHandler: ${JSON.stringify({ networkFound, lastHopLqi, lastHopRssi })}`);

            // don't want networks we can't join or wrong profile
            if (networkFound.allowingJoin && networkFound.stackProfile === STACK_PROFILE_ZIGBEE_PRO) {
                joinableNetworks.push({ networkFound, lastHopLqi, lastHopRssi });
            }
        };

        this.ezsp.ezspScanCompleteHandler = (channel: number, status: SLStatus): void => {
            logger.debug(`ezspScanCompleteHandler: ${JSON.stringify({ channel, status })}`);
            progressBar.stop();
            clearInterval(progressInterval);

            if (status === SLStatus.OK) {
                if (scanCompleted) {
                    scanCompleted();
                }
            } else {
                logger.error(`Failed to scan ${channel} with status=${SLStatus[status]}.`);
            }
        };

        const startScanStatus = await this.ezsp.ezspStartScan(EzspNetworkScanType.ACTIVE_SCAN, ZSpec.Utils.channelsToUInt32Mask(channels), duration);

        if (startScanStatus !== SLStatus.OK) {
            logger.error(`Failed start scan request with status=${SLStatus[startScanStatus]}.`);
            // restore zigbee-herdsman default
            this.ezsp.ezspNetworkFoundHandler = ezspNetworkFoundHandlerOriginal;
            this.ezsp.ezspScanCompleteHandler = ezspScanCompleteHandlerOriginal;
            return true;
        }

        progressBar.start(totalTime, 0);

        const progressInterval = setInterval(() => {
            progressBar.increment(500);
        }, 500);

        await new Promise<void>((resolve) => {
            scanCompleted = resolve;
        });

        // restore zigbee-herdsman default
        this.ezsp.ezspNetworkFoundHandler = ezspNetworkFoundHandlerOriginal;
        this.ezsp.ezspScanCompleteHandler = ezspScanCompleteHandlerOriginal;

        if (joinableNetworks.length === 0) {
            logger.error("Found no network available to join.");
            return false;
        }

        // sort network found by RSSI
        joinableNetworks.sort((a, b) => b.lastHopLqi - a.lastHopLqi);

        const networkChoices = [];

        for (const { networkFound, lastHopLqi, lastHopRssi } of joinableNetworks) {
            networkChoices.push({
                name:
                    `PAN ID: ${networkFound.panId} | Ext PAN ID: ${networkFound.extendedPanId} | ` +
                    `Channel: ${networkFound.channel} | LQI: ${lastHopLqi} | RSSI: ${lastHopRssi}`,
                value: networkFound,
            });
        }

        const networkToJoin = await select<EmberZigbeeNetwork>({ choices: networkChoices, message: "Available networks" });
        const defaultLinkKey = Buffer.from(ZSpec.INTEROPERABILITY_LINK_KEY);
        const state: EmberInitialSecurityState = {
            bitmask:
                EmberInitialSecurityBitmask.TRUST_CENTER_GLOBAL_LINK_KEY |
                EmberInitialSecurityBitmask.HAVE_PRECONFIGURED_KEY |
                EmberInitialSecurityBitmask.NO_FRAME_COUNTER_RESET |
                EmberInitialSecurityBitmask.REQUIRE_ENCRYPTED_KEY,
            preconfiguredKey: { contents: defaultLinkKey },
            networkKey: { contents: Buffer.alloc(16) }, // blank
            networkKeySequenceNumber: 0,
            preconfiguredTrustCenterEui64: ZSpec.BLANK_EUI64,
        };

        status = await this.ezsp.ezspSetInitialSecurityState(state);

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set initial security state with status=${SLStatus[status]}.`);
            return true;
        }

        const extended: EmberExtendedSecurityBitmask =
            EmberExtendedSecurityBitmask.JOINER_GLOBAL_LINK_KEY | EmberExtendedSecurityBitmask.EXT_NO_FRAME_COUNTER_RESET;
        status = await this.ezsp.ezspSetExtendedSecurityBitmask(extended);

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set extended security bitmask to ${extended} with status=${SLStatus[status]}.`);
            return true;
        }

        status = await this.ezsp.ezspClearKeyTable();

        if (status !== SLStatus.OK) {
            logger.error(`Failed to clear key table with status=${SLStatus[status]}.`);
        }

        status = await this.ezsp.ezspImportTransientKey(ZSpec.BLANK_EUI64, { contents: defaultLinkKey });

        if (status !== SLStatus.OK) {
            logger.error(`Failed to import transient key with status=${SLStatus[status]}.`);
            return true;
        }

        status = await this.ezsp.ezspJoinNetwork(EmberNodeType.ROUTER, {
            extendedPanId: networkToJoin.extendedPanId,
            panId: networkToJoin.panId,
            radioTxPower,
            radioChannel: networkToJoin.channel,
            joinMethod: EmberJoinMethod.MAC_ASSOCIATION,
            nwkManagerId: 0,
            nwkUpdateId: networkToJoin.nwkUpdateId,
            channels: ZSpec.ALL_802_15_4_CHANNELS_MASK,
        });

        if (status !== SLStatus.OK) {
            logger.error(`Failed to join specified network with status=${SLStatus[status]}.`);
            return true;
        }

        await waitForStackStatus(this.ezsp, SLStatus.NETWORK_UP);
        await emberSetConcentrator(this.ezsp, this.stackConfig);
        this.setRouterState(RouterState.RUNNING);

        const permitJoining = await confirm({ default: true, message: "Permit joining to extend network?" });

        if (permitJoining) {
            const [status] = await this.permitJoining(180, true);

            if (status !== SLStatus.OK) {
                logger.error(`Failed to permit joining with status=${SLStatus[status]}.`);
            }
        }

        return false;
    }

    private async menuNetworkLeave(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        const confirmed = await confirm({
            default: false,
            message: "Confirm leave network? (Cannot be undone without a backup.)",
        });

        if (!confirmed) {
            logger.info("Network leave cancelled.");
            return false;
        }

        if (this.routerState !== RouterState.RUNNING) {
            const initStatus = await emberNetworkInit(this.ezsp, true);

            if (initStatus === SLStatus.NOT_JOINED) {
                logger.info("No network present.");
                return false;
            }

            if (initStatus !== SLStatus.OK) {
                logger.error(`Failed network init request with status=${SLStatus[initStatus]}.`);
                return true;
            }

            await waitForStackStatus(this.ezsp, SLStatus.NETWORK_UP);
            // NOTE: explicitly not set since we don't want to consider this "running"
            // this.setRouterState(RouterState.RUNNING)
        }

        const leaveStatus = await this.ezsp.ezspLeaveNetwork();

        if (leaveStatus !== SLStatus.OK) {
            logger.error(`Failed to leave network with status=${SLStatus[leaveStatus]}.`);
            return true;
        }

        await waitForStackStatus(this.ezsp, SLStatus.NETWORK_DOWN);
        this.setRouterState(RouterState.NOT_JOINED);
        logger.info("Left network.");

        return false;
    }

    private async menuNetworkRejoin(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        const initStatus = await emberNetworkInit(this.ezsp, true);
        const notJoined = initStatus === SLStatus.NOT_JOINED;

        this.setRouterState(notJoined ? RouterState.NOT_JOINED : RouterState.UNKNOWN);

        if (!notJoined && initStatus !== SLStatus.OK) {
            logger.error(`Failed network init request with status=${SLStatus[initStatus]}.`);
            return true;
        }

        if (notJoined) {
            logger.info("No network present in the adapter, cannot rejoin.");
            return false;
        }

        await waitForStackStatus(this.ezsp, SLStatus.NETWORK_UP);
        await emberSetConcentrator(this.ezsp, this.stackConfig);

        const [npStatus, nodeType, netParams] = await this.ezsp.ezspGetNetworkParameters();

        if (npStatus !== SLStatus.OK) {
            logger.error(`Failed to get network parameters with status=${SLStatus[npStatus]}.`);
            return true;
        }

        if (nodeType !== EmberNodeType.ROUTER) {
            logger.error(`Current network is not router: nodeType=${EmberNodeType[nodeType]}`);
            return true;
        }

        logger.info(`Current adapter network: ${JSON.stringify(netParams)}`);
        this.setRouterState(RouterState.RUNNING);

        const permitJoining = await confirm({ default: true, message: "Permit joining to extend network?" });

        if (permitJoining) {
            const [status] = await this.permitJoining(180, true);

            if (status !== SLStatus.OK) {
                logger.error(`Failed to permit joining with status=${SLStatus[status]}.`);
            }
        }

        return false;
    }

    private async menuPingCoordinator(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        const [status] = await this.ezsp.send(
            EmberOutgoingMessageType.DIRECT,
            ZSpec.COORDINATOR_ADDRESS,
            {
                profileId: ZSpec.HA_PROFILE_ID,
                clusterId: Zcl.Clusters.genBasic.ID,
                sourceEndpoint: ROUTER_FIXED_ENDPOINTS[0].endpoint,
                destinationEndpoint: ROUTER_FIXED_ENDPOINTS[0].endpoint,
                options: DEFAULT_APS_OPTIONS,
                groupId: 0,
                sequence: 0,
            },
            // type 'readResponse', cluster 'genBasic', data '{"zclVersion":8}'
            Buffer.from("1801010000002008", "hex"),
            0,
            0,
        );

        if (status !== SLStatus.OK) {
            logger.error(`Failed to ping coordinator with status=${SLStatus[status]}.`);
        }

        return false;
    }

    private async menuReadCounters(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        const alsoClear = await confirm({ message: "Clear counters after read?", default: true });
        const counters = alsoClear ? await this.ezsp.ezspReadAndClearCounters() : await this.ezsp.ezspReadCounters();

        for (let i = 0; i < EmberCounterType.COUNT; i++) {
            logger.info(`Counter ${EmberCounterType[i]}=${counters[i]}`);
        }

        return false;
    }

    private async menuReloadEventHandlers(): Promise<boolean> {
        await this.loadCustomEventHandlers();

        return false;
    }

    private async menuRunScript(): Promise<boolean> {
        const jsFile = await browseToFile("File to run", DEFAULT_ROUTER_SCRIPT_MJS_PATH);

        try {
            const scriptToRun = await import(pathToFileURL(jsFile).toString());

            scriptToRun.default(this, logger);
        } catch (error) {
            logger.error(error);
        }

        return false;
    }

    private async menuSetManufacturerCode(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        enum Source {
            ZCL_LIST = 0,
            INPUT = 1,
        }
        const source = await select<-1 | Source>({
            choices: [
                { name: "From ZCL list (long)", value: Source.ZCL_LIST },
                { name: "From manual input", value: Source.INPUT },
                { name: "Go Back", value: -1 },
            ],
            message: "Source for the manufacturer code",
        });

        let newCode: Zcl.ManufacturerCode = this.manufacturerCode;

        switch (source) {
            case Source.ZCL_LIST: {
                newCode = await select<Zcl.ManufacturerCode>({
                    choices: Object.keys(Zcl.ManufacturerCode).map((k) => ({
                        name: k,
                        value: Zcl.ManufacturerCode[k as keyof typeof Zcl.ManufacturerCode],
                    })),
                    message: "Select manufacturer",
                });

                break;
            }

            case Source.INPUT: {
                newCode = Number.parseInt(
                    await input({
                        default: Zcl.ManufacturerCode.SILICON_LABORATORIES.toString(),
                        message: "Code [0-65535/0x0000-0xFFFF]",
                        validate(value) {
                            if (/\./.test(value)) {
                                return false;
                            }

                            const v = Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
                            return v >= 0 && v <= 65535;
                        },
                    }),
                    10,
                );

                break;
            }

            case -1: {
                return false;
            }
        }

        this.manufacturerCode = newCode;

        await this.ezsp.ezspSetManufacturerCode(newCode);

        return false;
    }

    private async menuTokensBackup(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        const saveFile = await browseToFile("Router tokens backup save file", DEFAULT_ROUTER_TOKENS_BACKUP_PATH, true);
        const eui64 = await this.ezsp.ezspGetEui64();
        const tokensBuf = await EmberTokensManager.saveTokens(this.ezsp, Buffer.from(eui64.slice(2 /* 0x */), "hex").reverse());

        if (tokensBuf) {
            writeFileSync(saveFile, tokensBuf.toString("hex"), "utf8");

            logger.info(`Tokens backup written to '${saveFile}'.`);
        } else {
            logger.error("Failed to backup tokens.");
        }

        return false;
    }

    private async menuTokensReset(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        const confirmed = await confirm({
            default: false,
            message: "Confirm tokens reset? (Cannot be undone without a backup.)",
        });

        if (!confirmed) {
            logger.info("Tokens reset cancelled.");
            return false;
        }

        const options = await checkbox<string>({
            choices: [
                { name: "Exclude network and APS outgoing frame counter tokens?", value: "excludeOutgoingFC", checked: false },
                { name: "Exclude stack boot counter token?", value: "excludeBootCounter", checked: false },
            ],
            message: "Reset options",
        });

        await this.ezsp.ezspTokenFactoryReset(options.includes("excludeOutgoingFC"), options.includes("excludeBootCounter"));

        return true;
    }

    private async menuTokensRestore(): Promise<boolean> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        const backupFile = await browseToFile("Router tokens backup file location", DEFAULT_ROUTER_TOKENS_BACKUP_PATH);
        const tokensBuf = Buffer.from(readFileSync(backupFile, "utf8"), "hex");
        const status = await EmberTokensManager.restoreTokens(this.ezsp, tokensBuf);

        if (status === SLStatus.OK) {
            logger.info("Restored router tokens.");
        } else {
            logger.error("Failed to restore router tokens.");
        }

        return true;
    }

    private async navigateMenu(): Promise<boolean> {
        const notRunning = this.routerState !== RouterState.RUNNING;
        const answer = await select<-1 | RouterMenu>({
            choices: [
                { name: "Join network", value: RouterMenu.NETWORK_JOIN },
                {
                    name: "Rejoin network",
                    value: RouterMenu.NETWORK_REJOIN,
                    disabled: this.routerState === RouterState.NOT_JOINED || this.routerState !== RouterState.UNKNOWN,
                },
                { name: "Leave network", value: RouterMenu.NETWORK_LEAVE },
                { name: "Backup NVM3 tokens", value: RouterMenu.TOKENS_BACKUP },
                { name: "Restore NVM3 tokens", value: RouterMenu.TOKENS_RESTORE },
                { name: "Reset NVM3 tokens", value: RouterMenu.TOKENS_RESET },
                { name: "Get network info", value: RouterMenu.NETWORK_INFO, disabled: notRunning },
                { name: "Set manufacturer code", value: RouterMenu.SET_MANUFACTURER_CODE, disabled: notRunning },
                { name: "Read counters", value: RouterMenu.PING_COORDINATOR, disabled: notRunning },
                { name: "Ping coordinator", value: RouterMenu.READ_COUNTERS, disabled: notRunning },
                { name: "Reload custom event handlers", value: RouterMenu.RELOAD_EVENT_HANDLERS },
                { name: "Run custom script", value: RouterMenu.RUN_SCRIPT, disabled: notRunning },
                { name: "Exit", value: -1 },
            ],
            message: "Menu",
        });

        switch (answer) {
            case RouterMenu.NETWORK_JOIN: {
                return await this.menuNetworkJoin();
            }

            case RouterMenu.NETWORK_REJOIN: {
                return await this.menuNetworkRejoin();
            }

            case RouterMenu.NETWORK_LEAVE: {
                return await this.menuNetworkLeave();
            }

            case RouterMenu.TOKENS_BACKUP: {
                return await this.menuTokensBackup();
            }

            case RouterMenu.TOKENS_RESTORE: {
                return await this.menuTokensRestore();
            }

            case RouterMenu.TOKENS_RESET: {
                return await this.menuTokensReset();
            }

            case RouterMenu.NETWORK_INFO: {
                return await this.menuNetworkInfo();
            }

            case RouterMenu.SET_MANUFACTURER_CODE: {
                return await this.menuSetManufacturerCode();
            }

            case RouterMenu.READ_COUNTERS: {
                return await this.menuReadCounters();
            }

            case RouterMenu.PING_COORDINATOR: {
                return await this.menuPingCoordinator();
            }

            case RouterMenu.RELOAD_EVENT_HANDLERS: {
                return await this.menuReloadEventHandlers();
            }

            case RouterMenu.RUN_SCRIPT: {
                return await this.menuRunScript();
            }
        }

        return true; // exit
    }

    private async onIncomingMessage(
        type: EmberIncomingMessageType,
        apsFrame: EmberApsFrame,
        lastHopLqi: number,
        sender: NodeId,
        messageContents: Buffer,
    ): Promise<void> {
        if (
            sender === ZSpec.COORDINATOR_ADDRESS &&
            type === EmberIncomingMessageType.UNICAST &&
            apsFrame.profileId === ZSpec.HA_PROFILE_ID &&
            apsFrame.clusterId === Zcl.Clusters.genBasic.ID &&
            apsFrame.destinationEndpoint === ROUTER_FIXED_ENDPOINTS[0].endpoint &&
            apsFrame.sourceEndpoint === ROUTER_FIXED_ENDPOINTS[0].endpoint
        ) {
            const header = Zcl.Header.fromBuffer(messageContents);

            if (
                header?.isGlobal &&
                header.frameControl.direction === Zcl.Direction.CLIENT_TO_SERVER &&
                header.commandIdentifier === Zcl.Foundation.read.ID
            ) {
                // handle replying to Z2M interview + ping attribute reads
                const frame = Zcl.Frame.fromBuffer(apsFrame.clusterId, header, messageContents, {});
                const replyPayload: { attrId: number; status: Zcl.Status; dataType?: DataType; attrData?: number | string } = {
                    attrId: frame.payload[0].attrId,
                    status: Zcl.Status.SUCCESS,
                    dataType: undefined,
                    attrData: undefined,
                };

                switch (replyPayload.attrId) {
                    case Zcl.Clusters.genBasic.attributes.zclVersion.ID: {
                        replyPayload.dataType = Zcl.Clusters.genBasic.attributes.zclVersion.type;
                        replyPayload.attrData = 8; // DataType.UINT8
                        break;
                    }

                    case Zcl.Clusters.genBasic.attributes.appVersion.ID: {
                        replyPayload.dataType = Zcl.Clusters.genBasic.attributes.appVersion.type;
                        replyPayload.attrData = emberFullVersion.ezsp; // DataType.UINT8
                        break;
                    }

                    case Zcl.Clusters.genBasic.attributes.stackVersion.ID: {
                        replyPayload.dataType = Zcl.Clusters.genBasic.attributes.stackVersion.type;
                        replyPayload.attrData = emberFullVersion.major; // DataType.UINT8
                        break;
                    }

                    case Zcl.Clusters.genBasic.attributes.manufacturerName.ID: {
                        replyPayload.dataType = Zcl.Clusters.genBasic.attributes.manufacturerName.type;
                        replyPayload.attrData = Zcl.ManufacturerCode[this.manufacturerCode]; // DataType.CHAR_STR
                        break;
                    }

                    case Zcl.Clusters.genBasic.attributes.modelId.ID: {
                        replyPayload.dataType = Zcl.Clusters.genBasic.attributes.modelId.type;
                        replyPayload.attrData = "Ember ZLI Router"; // DataType.CHAR_STR
                        break;
                    }

                    case Zcl.Clusters.genBasic.attributes.dateCode.ID: {
                        replyPayload.dataType = Zcl.Clusters.genBasic.attributes.dateCode.type;
                        replyPayload.attrData = emberFullVersion.revision; // DataType.CHAR_STR
                        break;
                    }

                    case Zcl.Clusters.genBasic.attributes.powerSource.ID: {
                        replyPayload.dataType = Zcl.Clusters.genBasic.attributes.powerSource.type;
                        // Mains
                        replyPayload.attrData = 1; // DataType.ENUM8
                        break;
                    }

                    case Zcl.Clusters.genBasic.attributes.swBuildId.ID: {
                        replyPayload.dataType = Zcl.Clusters.genBasic.attributes.swBuildId.type;
                        replyPayload.attrData = emberFullVersion.revision; // DataType.CHAR_STR
                        break;
                    }
                }

                if (replyPayload.dataType !== undefined && replyPayload.attrData !== undefined) {
                    const zclFrame = Zcl.Frame.create(
                        header.frameControl.frameType,
                        Zcl.Direction.SERVER_TO_CLIENT,
                        true,
                        this.manufacturerCode,
                        header.transactionSequenceNumber,
                        Zcl.Foundation.readRsp.ID,
                        Zcl.Clusters.genBasic.ID,
                        [replyPayload], // repetitive strategy, wrap in array
                        {},
                    );

                    logger.debug(
                        `~~~> [ZCL to=${ZSpec.COORDINATOR_ADDRESS} apsFrame=${JSON.stringify(apsFrame)} header=${JSON.stringify(zclFrame.header)}]`,
                    );

                    try {
                        await this.ezsp!.send(EmberOutgoingMessageType.DIRECT, ZSpec.COORDINATOR_ADDRESS, apsFrame, zclFrame.toBuffer(), 0, 0);
                    } catch (error) {
                        logger.debug(error);
                    }
                }
            }
        }

        if (this.customEventHandlers.onIncomingMessage) {
            await this.customEventHandlers.onIncomingMessage(this, logger, type, apsFrame, lastHopLqi, sender, messageContents);
        }
    }

    private async onMessageSent(
        status: SLStatus,
        type: EmberOutgoingMessageType,
        indexOrDestination: number,
        apsFrame: EmberApsFrame,
        messageTag: number,
    ): Promise<void> {
        switch (status) {
            case SLStatus.ZIGBEE_DELIVERY_FAILED: {
                // no ACK was received from the destination
                logger.error(
                    `Delivery of ${EmberOutgoingMessageType[type]} failed for '${indexOrDestination}' [apsFrame=${JSON.stringify(apsFrame)} messageTag=${messageTag}]`,
                );

                break;
            }

            case SLStatus.OK: {
                if (
                    type === EmberOutgoingMessageType.MULTICAST &&
                    apsFrame.destinationEndpoint === 0xff &&
                    apsFrame.groupId < EMBER_MIN_BROADCAST_ADDRESS &&
                    !this.multicastTable.includes(apsFrame.groupId)
                ) {
                    // workaround for devices using multicast for state update (coordinator passthrough)
                    const tableIdx = this.multicastTable.length;
                    const multicastEntry: EmberMulticastTableEntry = {
                        multicastId: apsFrame.groupId,
                        endpoint: ROUTER_FIXED_ENDPOINTS[0].endpoint,
                        networkIndex: ROUTER_FIXED_ENDPOINTS[0].networkIndex,
                    };
                    // set immediately to avoid potential race
                    this.multicastTable.push(multicastEntry.multicastId);

                    try {
                        const status = await this.ezsp!.ezspSetMulticastTableEntry(tableIdx, multicastEntry);

                        if (status !== SLStatus.OK) {
                            throw new Error(
                                `Failed to register group '${multicastEntry.multicastId}' in multicast table with status=${SLStatus[status]}.`,
                            );
                        }

                        logger.debug(`Registered multicast table entry (${tableIdx}): ${JSON.stringify(multicastEntry)}.`);
                    } catch (error) {
                        // remove to allow retry on next occurrence
                        this.multicastTable.splice(tableIdx, 1);
                        logger.error(`${error}`);
                    }
                }

                break;
            }
        }
        // shouldn't be any other status

        if (this.customEventHandlers.onMessageSent) {
            await this.customEventHandlers.onMessageSent(this, logger, status, type, indexOrDestination, apsFrame, messageTag);
        }
    }

    private async onStackStatus(status: SLStatus): Promise<void> {
        if (status === SLStatus.NETWORK_DOWN) {
            this.setRouterState(RouterState.NOT_JOINED);
        }

        if (this.customEventHandlers.onStackStatus) {
            await this.customEventHandlers.onStackStatus(this, logger, status);
        }
    }

    private async onTouchlinkMessage(
        sourcePanId: PanId,
        sourceAddress: Eui64,
        groupId: null | number,
        lastHopLqi: number,
        messageContents: Buffer,
    ): Promise<void> {
        if (this.customEventHandlers.onTouchlinkMessage) {
            await this.customEventHandlers.onTouchlinkMessage(this, logger, sourcePanId, sourceAddress, groupId, lastHopLqi, messageContents);
        }
    }

    private async onZDOResponse(apsFrame: EmberApsFrame, sender: NodeId, messageContents: Buffer): Promise<void> {
        if (this.customEventHandlers.onZDOResponse) {
            await this.customEventHandlers.onZDOResponse(this, logger, apsFrame, sender, messageContents);
        }
    }

    private async permitJoining(
        duration: number,
        broadcastMgmtPermitJoin: boolean,
    ): Promise<[SLStatus, apsFrame: EmberApsFrame | undefined, messageTag: number | undefined]> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        let status = await this.ezsp.ezspPermitJoining(duration);
        let apsFrame: EmberApsFrame | undefined;
        let messageTag: number | undefined;

        logger.debug(`Permit joining for ${duration} sec. status=${[status]}`);

        if (broadcastMgmtPermitJoin) {
            // `authentication`: TC significance always 1 (zb specs)
            const zdoPayload = BuffaloZdo.buildRequest(true, Zdo.ClusterId.PERMIT_JOINING_REQUEST, duration, 1, []);
            [status, apsFrame, messageTag] = await this.sendZDORequest(
                ZSpec.BroadcastAddress.DEFAULT,
                Zdo.ClusterId.PERMIT_JOINING_REQUEST,
                zdoPayload,
                DEFAULT_APS_OPTIONS,
            );
        }

        return [status, apsFrame, messageTag];
    }

    private async sendZDORequest(
        destination: NodeId,
        clusterId: number,
        messageContents: Buffer,
        options: EmberApsOption,
    ): Promise<[SLStatus, apsFrame: EmberApsFrame | undefined, messageTag: number | undefined]> {
        if (!this.ezsp) {
            logger.error("Invalid state, no EZSP layer available.");
            return this.exit(1);
        }

        this.zdoRequestSequence = ++this.zdoRequestSequence & APPLICATION_ZDO_SEQUENCE_MASK;
        const messageTag = this.zdoRequestSequence;
        messageContents[0] = messageTag;

        const apsFrame: EmberApsFrame = {
            profileId: Zdo.ZDO_PROFILE_ID,
            clusterId,
            sourceEndpoint: Zdo.ZDO_ENDPOINT,
            destinationEndpoint: Zdo.ZDO_ENDPOINT,
            options,
            groupId: 0,
            sequence: 0, // set by stack
        };

        if (
            destination === ZSpec.BroadcastAddress.DEFAULT ||
            destination === ZSpec.BroadcastAddress.RX_ON_WHEN_IDLE ||
            destination === ZSpec.BroadcastAddress.SLEEPY
        ) {
            logger.debug(
                `~~~> [ZDO ${Zdo.ClusterId[clusterId]} BROADCAST to=${destination} messageTag=${messageTag} ` +
                    `messageContents=${messageContents.toString("hex")}]`,
            );

            const [status, apsSequence] = await this.ezsp.ezspSendBroadcast(
                ZSpec.NULL_NODE_ID, // alias
                destination,
                0, // nwkSequence
                apsFrame,
                DEFAULT_ZDO_REQUEST_RADIUS,
                messageTag,
                messageContents,
            );
            apsFrame.sequence = apsSequence;

            logger.debug(`~~~> [SENT ZDO type=BROADCAST apsSequence=${apsSequence} messageTag=${messageTag} status=${SLStatus[status]}`);
            return [status, apsFrame, messageTag];
        }

        logger.debug(
            `~~~> [ZDO ${Zdo.ClusterId[clusterId]} UNICAST to=${destination} messageTag=${messageTag} ` +
                `messageContents=${messageContents.toString("hex")}]`,
        );

        const [status, apsSequence] = await this.ezsp.ezspSendUnicast(
            EmberOutgoingMessageType.DIRECT,
            destination,
            apsFrame,
            messageTag,
            messageContents,
        );
        apsFrame.sequence = apsSequence;

        logger.debug(`~~~> [SENT ZDO type=DIRECT apsSequence=${apsSequence} messageTag=${messageTag} status=${SLStatus[status]}`);
        return [status, apsFrame, messageTag];
    }

    private setRouterState(newState: RouterState): void {
        if (newState === this.routerState) {
            return;
        }

        logger.info(`Router state changed: previous=${RouterState[this.routerState]} new=${RouterState[newState]}.`);

        this.routerState = newState;
    }
}
