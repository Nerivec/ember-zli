import { Zcl, ZSpec } from "zigbee-herdsman";
import type { EmberMulticastId } from "zigbee-herdsman/dist/adapter/ember/types.js";
import type { ClusterId, ProfileId } from "zigbee-herdsman/dist/zspec/tstypes.js";

type FixedEndpointInfo = {
    /** Actual Zigbee endpoint number. uint8_t */
    endpoint: number;
    /** Profile ID of the device on this endpoint. */
    profileId: ProfileId;
    /** Device ID of the device on this endpoint. uint16_t */
    deviceId: number;
    /** Version of the device. uint8_t */
    deviceVersion: number;
    /** List of server clusters. */
    inClusterList: readonly ClusterId[];
    /** List of client clusters. */
    outClusterList: readonly ClusterId[];
    /** Network index for this endpoint. uint8_t */
    networkIndex: number;
    /** Multicast group IDs to register in the multicast table */
    multicastIds: readonly EmberMulticastId[];
};

/**
 * List of endpoints to register.
 *
 * Index 0 is used as default and expected to be the primary network.
 */
export const ROUTER_FIXED_ENDPOINTS: readonly FixedEndpointInfo[] = [
    {
        // primary network
        endpoint: 1,
        profileId: ZSpec.HA_PROFILE_ID,
        deviceId: 0x08, // HA-rangeextender
        deviceVersion: 1,
        inClusterList: [Zcl.Clusters.genBasic.ID, Zcl.Clusters.touchlink.ID],
        outClusterList: [Zcl.Clusters.genOta.ID],
        networkIndex: 0x00,
        // - Cluster spec 3.7.2.4.1: group identifier 0x0000 is reserved for the global scene used by the OnOff cluster.
        // - 901: defaultBindGroup
        multicastIds: [0, 901],
    },
    {
        // green power
        endpoint: ZSpec.GP_ENDPOINT,
        profileId: ZSpec.GP_PROFILE_ID,
        deviceId: 0x66, // GP-combo-basic
        deviceVersion: 1,
        inClusterList: [Zcl.Clusters.greenPower.ID],
        outClusterList: [Zcl.Clusters.greenPower.ID],
        networkIndex: 0x00,
        multicastIds: [0x0b84],
    },
];
