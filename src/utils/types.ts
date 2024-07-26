import { EmberKeyData, EmberVersion } from 'zigbee-herdsman/dist/adapter/ember/types.js'
import { EUI64 } from 'zigbee-herdsman/dist/zspec/tstypes.js'

import { BAUDRATES } from './consts.js'

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type AdapterModel =
    | 'Aeotec Zi-Stick (ZGA008)'
    | 'EasyIOT ZB-GW04 v1.1'
    | 'EasyIOT ZB-GW04 v1.2'
    | 'Home Assistant SkyConnect'
    | 'Home Assistant Yellow'
    | 'SMLight SLZB06-M'
    | 'SMLight SLZB07'
    | 'Sonoff ZBDongle-E'
    | 'TubeZB MGM24'

export type PortType = 'serial' | 'tcp'
export type BaudRate = (typeof BAUDRATES)[number]

export type PortConf = {
    baudRate: number
    path: string
    rtscts: boolean
    xon: boolean
    xoff: boolean
}

export type EmberFullVersion = { ezsp: number; revision: string } & EmberVersion
export type ConfigValue = { [key: string]: string }

export type FirmwareVariant = 'latest' | 'official' | 'recommended'
export type FirmwareVersion = `${Digit}.${Digit}.${Digit}.${Digit}`
export type FirmwareVersionShort = `${Digit}.${Digit}.${Digit}`
export type FirmwareFilename = `${string}.gbl`
export type FirmwareURL = `https://${string}/${FirmwareFilename}`

export type FirmwareMetadata = {
    settings: Omit<PortConf, 'path' | 'xoff' | 'xon'>
    url: FirmwareURL | undefined
    version: FirmwareVersion
}

export type FirmwareFileMetadata = {
    metadata_version: number // 1
    sdk_version: FirmwareVersionShort // '5.0.1'
    fw_type: 'ncp-uart-hw' | 'ncp-uart-sw' | 'rcp-uart-802154' | 'rcp-uart-802154-blehci'
    baudrate: number // 115200
    ezsp_version?: FirmwareVersion // '8.0.1.0'
    ot_version?: FirmwareVersion // '2.5.1.0'
    ble_version?: FirmwareVersionShort // '8.1.0'
    cpc_version?: FirmwareVersion // '5.0.1'
}

export type TokensInfo = {
    nvm3Key: string // keyof typeof NVM3ObjectKey
    size: number
    arraySize: number
    data: string[]
}[]

/**
 * Use for a link key backup.
 *
 * Each entry notes the EUI64 of the device it is paired to and the key data.
 *   This key may be hashed and not the actual link key currently in use.
 */
export type LinkKeyBackupData = {
    deviceEui64: EUI64
    key: EmberKeyData
    outgoingFrameCounter: number
    incomingFrameCounter: number
}

export type StackConfig = {
    CONCENTRATOR_RAM_TYPE: 'high' | 'low'
    /**
     * Minimum Time between broadcasts (in seconds) <1-60>
     * Default: 10
     * The minimum amount of time that must pass between MTORR broadcasts.
     */
    CONCENTRATOR_MIN_TIME: number
    /**
     * Maximum Time between broadcasts (in seconds) <30-300>
     * Default: 60
     * The maximum amount of time that can pass between MTORR broadcasts.
     */
    CONCENTRATOR_MAX_TIME: number
    /**
     * Route Error Threshold <1-100>
     * Default: 3
     * The number of route errors that will trigger a re-broadcast of the MTORR.
     */
    CONCENTRATOR_ROUTE_ERROR_THRESHOLD: number
    /**
     * Delivery Failure Threshold <1-100>
     * Default: 1
     * The number of APS delivery failures that will trigger a re-broadcast of the MTORR.
     */
    CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD: number
    /**
     * Maximum number of hops for Broadcast <0-30>
     * Default: 0
     * The maximum number of hops that the MTORR broadcast will be allowed to have.
     * A value of 0 will be converted to the EMBER_MAX_HOPS value set by the stack.
     */
    CONCENTRATOR_MAX_HOPS: number
    /** <6-64> (Default: 6) @see EzspConfigId.MAX_END_DEVICE_CHILDREN */
    MAX_END_DEVICE_CHILDREN: number
    /** <-> (Default: 10000) @see EzspValueId.TRANSIENT_DEVICE_TIMEOUT */
    TRANSIENT_DEVICE_TIMEOUT: number
    /** <0-14> (Default: 8) @see EzspConfigId.END_DEVICE_POLL_TIMEOUT */
    END_DEVICE_POLL_TIMEOUT: number
    /** <0-65535> (Default: 300) @see EzspConfigId.TRANSIENT_KEY_TIMEOUT_S */
    TRANSIENT_KEY_TIMEOUT_S: number
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

export type CpcSystemCommand = {
    /** Identifier of the command. uint8_t */
    commandId: CpcSystemCommandId
    /** Command sequence number. uint8_t */
    seq: number
    /** Length of the payload in bytes. uint16_t */
    length: number
    /** Command payload. uint8_t[PAYLOAD_LENGTH_MAX] */
    payload: Buffer
}
