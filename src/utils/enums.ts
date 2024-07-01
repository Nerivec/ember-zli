export enum FirmwareSource {
    PRE_DEFINED = 0,
    URL = 1,
    DATA_FOLDER = 2,
}

export enum FirmwareValidation {
    VALID = 0,
    INVALID = 1,
    CANCELLED = 2,
}

/**
 * The NVM3 object key is used as a distinct identifier tag for a token stored in NVM3.
 */
export enum NVM3ObjectKey {
    // STACK KEYS
    STACK_NVDATA_VERSION = 0x10000 | 0xff01,
    STACK_BOOT_COUNTER = 0x10000 | 0xe263,
    STACK_NONCE_COUNTER = 0x10000 | 0xe563,
    STACK_ANALYSIS_REBOOT = 0x10000 | 0xe162,
    STACK_KEYS = 0x10000 | 0xeb79,
    STACK_NODE_DATA = 0x10000 | 0xee64,
    STACK_CLASSIC_DATA = 0x10000 | 0xe364,
    STACK_ALTERNATE_KEY = 0x10000 | 0xe475,
    STACK_APS_FRAME_COUNTER = 0x10000 | 0xe123,
    STACK_TRUST_CENTER = 0x10000 | 0xe124,
    STACK_NETWORK_MANAGEMENT = 0x10000 | 0xe125,
    STACK_PARENT_INFO = 0x10000 | 0xe126,
    STACK_PARENT_ADDITIONAL_INFO = 0x10000 | 0xe127,
    STACK_MULTI_PHY_NWK_INFO = 0x10000 | 0xe128,
    STACK_MIN_RECEIVED_RSSI = 0x10000 | 0xe129,
    // Restored EUI64
    STACK_RESTORED_EUI64 = 0x10000 | 0xe12a,

    // MULTI-NETWORK STACK KEYS
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    MULTI_NETWORK_STACK_KEYS = 0x10000 | 0x0000,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    MULTI_NETWORK_STACK_NODE_DATA = 0x10000 | 0x0080,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    MULTI_NETWORK_STACK_ALTERNATE_KEY = 0x10000 | 0x0100,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    MULTI_NETWORK_STACK_TRUST_CENTER = 0x10000 | 0x0180,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    MULTI_NETWORK_STACK_NETWORK_MANAGEMENT = 0x10000 | 0x0200,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    MULTI_NETWORK_STACK_PARENT_INFO = 0x10000 | 0x0280,

    // Temporary solution for multi-network nwk counters:
    // This counter will be used on the network with index 1.
    MULTI_NETWORK_STACK_NONCE_COUNTER = 0x10000 | 0xe220,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved
    MULTI_NETWORK_STACK_PARENT_ADDITIONAL_INFO = 0x10000 | 0x0300,

    // GP stack tokens.
    STACK_GP_DATA = 0x10000 | 0xe258,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    STACK_GP_PROXY_TABLE = 0x10000 | 0x0380,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    STACK_GP_SINK_TABLE = 0x10000 | 0x0400,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved
    STACK_GP_INCOMING_FC = 0x10000 | 0x0480,

    // APP KEYS
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    STACK_BINDING_TABLE = 0x10000 | 0x0500,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    STACK_CHILD_TABLE = 0x10000 | 0x0580,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    STACK_KEY_TABLE = 0x10000 | 0x0600,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    STACK_CERTIFICATE_TABLE = 0x10000 | 0x0680,
    STACK_ZLL_DATA = 0x10000 | 0xe501,
    STACK_ZLL_SECURITY = 0x10000 | 0xe502,
    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved.
    STACK_ADDITIONAL_CHILD_DATA = 0x10000 | 0x0700,

    // This key is used for an indexed token and the subsequent 0x7F keys are also reserved
    STACK_GP_INCOMING_FC_IN_SINK = 0x10000 | 0x0780,
}
