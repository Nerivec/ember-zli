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

/** Enumeration representing spinel protocol status code. uint32_t */
export enum CpcSystemStatus {
    /** Operation has completed successfully. */
    OK = 0,
    /** Operation has failed for some undefined reason. */
    FAILURE = 1,
    /** The given operation has not been implemented. */
    UNIMPLEMENTED = 2,
    /** An argument to the given operation is invalid. */
    INVALID_ARGUMENT = 3,
    /** The given operation is invalid for the current state of the device. */
    INVALID_STATE = 4,
    /** The given command is not recognized. */
    INVALID_COMMAND = 5,
    /** The given Spinel interface is not supported. */
    INVALID_INTERFACE = 6,
    /** An internal runtime error has occurred. */
    INTERNAL_ERROR = 7,
    /** A security or authentication error has occurred. */
    SECURITY_ERROR = 8,
    /** An error has occurred while parsing the command. */
    PARSE_ERROR = 9,
    /** The operation is in progress and will be completed asynchronously. */
    IN_PROGRESS = 10,
    /** The operation has been prevented due to memory pressure. */
    NOMEM = 11,
    /** The device is currently performing a mutually exclusive operation. */
    BUSY = 12,
    /** The given property is not recognized. */
    PROP_NOT_FOUND = 13,
    /** The packet was dropped. */
    PACKET_DROPPED = 14,
    /** The result of the operation is empty. */
    EMPTY = 15,
    /** The command was too large to fit in the internal buffer. */
    CMD_TOO_BIG = 16,
    /** The packet was not acknowledged. */
    NO_ACK = 17,
    /** The packet was not sent due to a CCA failure. */
    CCA_FAILURE = 18,
    /** The operation is already in progress or the property was already set to the given value. */
    ALREADY = 19,
    /** The given item could not be found in the property. */
    ITEM_NOT_FOUND = 20,
    /** The given command cannot be performed on this property. */
    INVALID_COMMAND_FOR_PROP = 21,
    // 22-111 : RESERVED
    RESET_POWER_ON = 112,
    RESET_EXTERNAL = 113,
    RESET_SOFTWARE = 114,
    RESET_FAULT = 115,
    RESET_CRASH = 116,
    RESET_ASSERT = 117,
    RESET_OTHER = 118,
    RESET_UNKNOWN = 119,
    RESET_WATCHDOG = 120,
    // 121-127 : RESERVED-RESET-CODES
    // 128 - 15,359: UNALLOCATED
    // 15,360 - 16,383: Vendor-specific
    // 16,384 - 1,999,999: UNALLOCATED
    // 2,000,000 - 2,097,151: Experimental Use Only (MUST NEVER be used in production!)
}

export enum CpcSystemCommandId {
    NOOP = 0x00,
    RESET = 0x01,
    PROP_VALUE_GET = 0x02,
    PROP_VALUE_SET = 0x03,
    PROP_VALUE_IS = 0x06,
    INVALID = 0xff,
}
