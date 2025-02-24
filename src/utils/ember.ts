import type { EmberMulticastId, EmberMulticastTableEntry, EmberNetworkInitStruct } from "zigbee-herdsman/dist/adapter/ember/types.js";

import type { EmberFullVersion, PortConf } from "./types.js";

import { ZSpec, type Zcl } from "zigbee-herdsman";
import type { DEFAULT_STACK_CONFIG } from "zigbee-herdsman/dist/adapter/ember/adapter/emberAdapter.js";
import { FIXED_ENDPOINTS } from "zigbee-herdsman/dist/adapter/ember/adapter/endpoints.js";
import {
    EMBER_HIGH_RAM_CONCENTRATOR,
    EMBER_LOW_RAM_CONCENTRATOR,
    SECURITY_LEVEL_Z3,
    STACK_PROFILE_ZIGBEE_PRO,
} from "zigbee-herdsman/dist/adapter/ember/consts.js";
import {
    EmberKeyStructBitmask,
    EmberLibraryId,
    EmberLibraryStatus,
    EmberNetworkInitBitmask,
    EmberSourceRouteDiscoveryMode,
    EmberVersionType,
    EzspStatus,
    IEEE802154CcaMode,
    SLStatus,
} from "zigbee-herdsman/dist/adapter/ember/enums.js";
import { EZSP_MIN_PROTOCOL_VERSION, EZSP_PROTOCOL_VERSION, EZSP_STACK_TYPE_MESH } from "zigbee-herdsman/dist/adapter/ember/ezsp/consts.js";
import { EzspConfigId, EzspDecisionId, EzspPolicyId, EzspValueId } from "zigbee-herdsman/dist/adapter/ember/ezsp/enums.js";
import { Ezsp } from "zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js";
import { lowHighBytes } from "zigbee-herdsman/dist/adapter/ember/utils/math.js";

import { logger } from "../index.js";
import { NVM3ObjectKey } from "./enums.js";
import { ROUTER_FIXED_ENDPOINTS } from "./router-endpoints.js";

const NS = { namespace: "ember" };
export let emberFullVersion: EmberFullVersion = {
    ezsp: -1,
    revision: "unknown",
    build: -1,
    major: -1,
    minor: -1,
    patch: -1,
    special: -1,
    type: EmberVersionType.PRE_RELEASE,
};

export const waitForStackStatus = async (ezsp: Ezsp, status: SLStatus, timeout = 10000): Promise<void> =>
    await new Promise<void>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            ezsp.removeListener("stackStatus", onStackStatus);
            return reject(new Error(`Timed out waiting for stack status '${SLStatus[status]}'.`));
        }, timeout);
        const onStackStatus = (receivedStatus: SLStatus): void => {
            logger.debug(`Received stack status ${receivedStatus} while waiting for ${status}.`, NS);

            if (status === receivedStatus) {
                clearTimeout(timeoutHandle);
                ezsp.removeListener("stackStatus", onStackStatus);
                resolve();
            }
        };

        ezsp.on("stackStatus", onStackStatus);
    });

export const emberStart = async (portConf: PortConf): Promise<Ezsp> => {
    const ezsp = new Ezsp({ adapter: "ember", ...portConf });

    // NOTE: something deep in this call can throw too
    const startResult = await ezsp.start();

    if (startResult !== 0) {
        throw new Error(`Failed to start EZSP layer with status=${EzspStatus[startResult]}.`);
    }

    // call before any other command, else fails
    emberFullVersion = await emberVersion(ezsp);

    return ezsp;
};

export const emberStop = async (ezsp: Ezsp): Promise<void> => {
    // workaround to remove ASH COUNTERS logged on stop
    // @ts-expect-error workaround (overriding private)
    ezsp.ash.logCounters = (): void => {};

    await ezsp.stop();
};

export const emberVersion = async (ezsp: Ezsp): Promise<EmberFullVersion> => {
    // send the Host version number to the NCP.
    // The NCP returns the EZSP version that the NCP is running along with the stackType and stackVersion
    let [ncpEzspProtocolVer, ncpStackType, ncpStackVer] = await ezsp.ezspVersion(EZSP_PROTOCOL_VERSION);

    // verify that the stack type is what is expected
    if (ncpStackType !== EZSP_STACK_TYPE_MESH) {
        throw new Error(`Stack type ${ncpStackType} is not expected!`);
    }

    if (ncpEzspProtocolVer === EZSP_PROTOCOL_VERSION) {
        logger.debug(`NCP EZSP protocol version (${ncpEzspProtocolVer}) matches Host.`, NS);
    } else if (ncpEzspProtocolVer < EZSP_PROTOCOL_VERSION && ncpEzspProtocolVer >= EZSP_MIN_PROTOCOL_VERSION) {
        [ncpEzspProtocolVer, ncpStackType, ncpStackVer] = await ezsp.ezspVersion(ncpEzspProtocolVer);

        logger.info(`NCP EZSP protocol version (${ncpEzspProtocolVer}) lower than Host. Switched.`, NS);
    } else {
        throw new Error(
            `NCP EZSP protocol version (${ncpEzspProtocolVer}) is not supported by Host [${EZSP_MIN_PROTOCOL_VERSION}-${EZSP_PROTOCOL_VERSION}].`,
        );
    }

    ezsp.setProtocolVersion(ncpEzspProtocolVer);
    logger.debug(`NCP info: EZSPVersion=${ncpEzspProtocolVer} StackType=${ncpStackType} StackVersion=${ncpStackVer}`, NS);

    const [status, versionStruct] = await ezsp.ezspGetVersionStruct();

    if (status !== SLStatus.OK) {
        // Should never happen with support of only EZSP v13+
        throw new Error("NCP has old-style version number. Not supported.");
    }

    const version: EmberFullVersion = {
        ezsp: ncpEzspProtocolVer,
        revision: `${versionStruct.major}.${versionStruct.minor}.${versionStruct.patch} [${EmberVersionType[versionStruct.type]}]`,
        ...versionStruct,
    };

    if (versionStruct.type !== EmberVersionType.GA) {
        logger.warning(`NCP is running a non-GA version (${EmberVersionType[versionStruct.type]}).`, NS);
    }

    logger.info(`NCP version: ${JSON.stringify(version)}`, NS);

    return version;
};

export const emberNetworkInit = async (ezsp: Ezsp, wasConfigured = false): Promise<SLStatus> => {
    if (!wasConfigured) {
        // minimum required for proper network init
        const status = await ezsp.ezspSetConfigurationValue(EzspConfigId.STACK_PROFILE, STACK_PROFILE_ZIGBEE_PRO);

        if (status !== SLStatus.OK) {
            throw new Error(`Failed to set stack profile with status=${SLStatus[status]}.`);
        }
    }

    const networkInitStruct: EmberNetworkInitStruct = {
        bitmask: EmberNetworkInitBitmask.PARENT_INFO_IN_TOKEN | EmberNetworkInitBitmask.END_DEVICE_REJOIN_ON_REBOOT,
    };

    return await ezsp.ezspNetworkInit(networkInitStruct);
};

export const emberNetworkConfig = async (
    ezsp: Ezsp,
    stackConf: typeof DEFAULT_STACK_CONFIG,
    manufacturerCode: Zcl.ManufacturerCode,
): Promise<void> => {
    /** The address cache needs to be initialized and used with the source routing code for the trust center to operate properly. */
    await ezsp.ezspSetConfigurationValue(EzspConfigId.TRUST_CENTER_ADDRESS_CACHE_SIZE, 2);
    /** MAC indirect timeout should be 7.68 secs (STACK_PROFILE_ZIGBEE_PRO) */
    await ezsp.ezspSetConfigurationValue(EzspConfigId.INDIRECT_TRANSMISSION_TIMEOUT, 7680);
    /** Max hops should be 2 * nwkMaxDepth, where nwkMaxDepth is 15 (STACK_PROFILE_ZIGBEE_PRO) */
    await ezsp.ezspSetConfigurationValue(EzspConfigId.MAX_HOPS, 30);
    await ezsp.ezspSetConfigurationValue(EzspConfigId.SUPPORTED_NETWORKS, 1);
    // allow other devices to modify the binding table
    await ezsp.ezspSetPolicy(EzspPolicyId.BINDING_MODIFICATION_POLICY, EzspDecisionId.CHECK_BINDING_MODIFICATIONS_ARE_VALID_ENDPOINT_CLUSTERS);
    // return message tag only in ezspMessageSentHandler()
    await ezsp.ezspSetPolicy(EzspPolicyId.MESSAGE_CONTENTS_IN_CALLBACK_POLICY, EzspDecisionId.MESSAGE_TAG_ONLY_IN_CALLBACK);
    await ezsp.ezspSetValue(EzspValueId.TRANSIENT_DEVICE_TIMEOUT, 2, lowHighBytes(stackConf.TRANSIENT_DEVICE_TIMEOUT));
    await ezsp.ezspSetManufacturerCode(manufacturerCode);
    // network security init
    await ezsp.ezspSetConfigurationValue(EzspConfigId.STACK_PROFILE, STACK_PROFILE_ZIGBEE_PRO);
    await ezsp.ezspSetConfigurationValue(EzspConfigId.SECURITY_LEVEL, SECURITY_LEVEL_Z3);
    // common configs
    await ezsp.ezspSetConfigurationValue(EzspConfigId.MAX_END_DEVICE_CHILDREN, stackConf.MAX_END_DEVICE_CHILDREN);
    await ezsp.ezspSetConfigurationValue(EzspConfigId.END_DEVICE_POLL_TIMEOUT, stackConf.END_DEVICE_POLL_TIMEOUT);
    await ezsp.ezspSetConfigurationValue(EzspConfigId.TRANSIENT_KEY_TIMEOUT_S, stackConf.TRANSIENT_KEY_TIMEOUT_S);
    // XXX: temp-fix: forces a side-effect in the firmware that prevents broadcast issues in environments with unusual interferences
    await ezsp.ezspSetValue(EzspValueId.CCA_THRESHOLD, 1, [0]);

    if (stackConf.CCA_MODE) {
        // validated in `loadStackConfig`
        await ezsp.ezspSetRadioIeee802154CcaMode(IEEE802154CcaMode[stackConf.CCA_MODE]);
    }
};

export const emberRegisterFixedEndpoints = async (ezsp: Ezsp, multicastTable: EmberMulticastId[], router = false): Promise<void> => {
    for (const ep of router ? ROUTER_FIXED_ENDPOINTS : FIXED_ENDPOINTS) {
        if (ep.networkIndex !== 0x00) {
            logger.debug(`Multi-network not currently supported. Skipping endpoint ${JSON.stringify(ep)}.`, NS);
            continue;
        }

        const [epStatus] = await ezsp.ezspGetEndpointFlags(ep.endpoint);

        // endpoint already registered
        if (epStatus === SLStatus.OK) {
            logger.debug(`Endpoint '${ep.endpoint}' already registered.`, NS);
        } else {
            // check to see if ezspAddEndpoint needs to be called
            // if ezspInit is called without NCP reset, ezspAddEndpoint is not necessary and will return an error
            const status = await ezsp.ezspAddEndpoint(
                ep.endpoint,
                ep.profileId,
                ep.deviceId,
                ep.deviceVersion,
                [...ep.inClusterList], // copy
                [...ep.outClusterList], // copy
            );

            if (status === SLStatus.OK) {
                logger.debug(`Registered endpoint '${ep.endpoint}'.`, NS);
            } else {
                throw new Error(`Failed to register endpoint '${ep.endpoint}' with status=${SLStatus[status]}.`);
            }
        }

        for (const multicastId of ep.multicastIds) {
            const multicastEntry: EmberMulticastTableEntry = {
                multicastId,
                endpoint: ep.endpoint,
                networkIndex: ep.networkIndex,
            };

            const status = await ezsp.ezspSetMulticastTableEntry(multicastTable.length, multicastEntry);

            if (status !== SLStatus.OK) {
                throw new Error(`Failed to register group '${multicastId}' in multicast table with status=${SLStatus[status]}.`);
            }

            logger.debug(`Registered multicast table entry (${multicastTable.length}): ${JSON.stringify(multicastEntry)}.`, NS);
            multicastTable.push(multicastEntry.multicastId);
        }
    }
};

export const emberSetConcentrator = async (ezsp: Ezsp, stackConf: typeof DEFAULT_STACK_CONFIG): Promise<void> => {
    const status = await ezsp.ezspSetConcentrator(
        true,
        stackConf.CONCENTRATOR_RAM_TYPE === "low" ? EMBER_LOW_RAM_CONCENTRATOR : EMBER_HIGH_RAM_CONCENTRATOR,
        stackConf.CONCENTRATOR_MIN_TIME,
        stackConf.CONCENTRATOR_MAX_TIME,
        stackConf.CONCENTRATOR_ROUTE_ERROR_THRESHOLD,
        stackConf.CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD,
        stackConf.CONCENTRATOR_MAX_HOPS,
    );

    if (status !== SLStatus.OK) {
        throw new Error(`[CONCENTRATOR] Failed to set concentrator with status=${SLStatus[status]}.`);
    }

    const remainTilMTORR = await ezsp.ezspSetSourceRouteDiscoveryMode(EmberSourceRouteDiscoveryMode.RESCHEDULE);

    logger.info(`[CONCENTRATOR] Started source route discovery. ${remainTilMTORR}ms until next broadcast.`, NS);
};

// -- Utils

export const getLibraryStatus = (id: EmberLibraryId, status: EmberLibraryStatus): string => {
    if (status === EmberLibraryStatus.LIBRARY_ERROR) {
        return "ERROR";
    }

    let statusStr = "NOT_PRESENT";
    const present = Boolean(status & EmberLibraryStatus.LIBRARY_PRESENT_MASK);

    if (present) {
        statusStr = "PRESENT";

        if (id === EmberLibraryId.ZIGBEE_PRO) {
            statusStr += status & EmberLibraryStatus.ZIGBEE_PRO_LIBRARY_HAVE_ROUTER_CAPABILITY ? " / ROUTER_CAPABILITY" : " / END_DEVICE_ONLY";

            if (status & EmberLibraryStatus.ZIGBEE_PRO_LIBRARY_ZLL_SUPPORT) {
                statusStr += " / ZLL_SUPPORT";
            }
        }

        if (id === EmberLibraryId.SECURITY_CORE) {
            statusStr += status & EmberLibraryStatus.SECURITY_LIBRARY_HAVE_ROUTER_SUPPORT ? " / ROUTER_SUPPORT" : " / END_DEVICE_ONLY";
        }

        if (id === EmberLibraryId.PACKET_VALIDATE) {
            statusStr += status & EmberLibraryStatus.PACKET_VALIDATE_LIBRARY_ENABLED ? " / ENABLED" : " / DISABLED";
        }
    }

    return statusStr;
};

export const getKeyStructBitmask = (bitmask: EmberKeyStructBitmask): string => {
    const bitmaskValues: string[] = [];

    for (const key in EmberKeyStructBitmask) {
        const val = EmberKeyStructBitmask[key as keyof typeof EmberKeyStructBitmask];

        if (typeof val !== "number") {
            continue;
        }

        if (bitmask & val) {
            bitmaskValues.push(key);
        }
    }

    return bitmaskValues.join("|");
};

export const parseTokenData = (nvm3Key: NVM3ObjectKey, data: Buffer): string => {
    switch (nvm3Key) {
        case NVM3ObjectKey.STACK_BOOT_COUNTER:
        case NVM3ObjectKey.STACK_NONCE_COUNTER:
        case NVM3ObjectKey.STACK_ANALYSIS_REBOOT:
        case NVM3ObjectKey.MULTI_NETWORK_STACK_NONCE_COUNTER:
        case NVM3ObjectKey.STACK_APS_FRAME_COUNTER:
        case NVM3ObjectKey.STACK_GP_INCOMING_FC:
        case NVM3ObjectKey.STACK_GP_INCOMING_FC_IN_SINK: {
            return `${data.readUIntLE(0, data.length)}`;
        }

        case NVM3ObjectKey.STACK_MIN_RECEIVED_RSSI: {
            return `${data.readIntLE(0, data.length)}`;
        }

        case NVM3ObjectKey.STACK_CHILD_TABLE: {
            // TODO
            return `EUI64: ${data.subarray(0, 8).toString("hex")} | ${data.subarray(8).toString("hex")}`;
        }

        // TODO:
        // case NVM3ObjectKey.STACK_BINDING_TABLE: {}

        // TODO:
        // case NVM3ObjectKey.STACK_KEY_TABLE: {}

        case NVM3ObjectKey.STACK_TRUST_CENTER: {
            // TODO
            return `${data.subarray(0, 2).toString("hex")} | EUI64: ${data.subarray(2, 10).toString("hex")} | Link Key: ${data.subarray(10).toString("hex")}`;
        }

        case NVM3ObjectKey.STACK_KEYS:
        case NVM3ObjectKey.STACK_ALTERNATE_KEY: {
            // TODO
            return `Network Key: ${data.subarray(0, -1).toString("hex")} | Sequence Number: ${data.readUInt8(16)}`;
        }

        case NVM3ObjectKey.STACK_NODE_DATA: {
            // TODO
            // [4-5] === network join status?
            return (
                `PAN ID: ${data.subarray(0, 2).toString("hex")} | Radio TX Power ${data.readUInt8(2)} | Radio Channel ${data.readUInt8(3)} ` +
                `| ${data.subarray(4, 8).toString("hex")} | Ext PAN ID: ${data.subarray(8, 16).toString("hex")}`
            );
        }

        case NVM3ObjectKey.STACK_NETWORK_MANAGEMENT: {
            // TODO
            return `Channels: ${ZSpec.Utils.uint32MaskToChannels(data.readUInt32LE(0))} | ${data.subarray(4).toString("hex")}`;
        }

        default: {
            return data.toString("hex");
        }
    }
};
