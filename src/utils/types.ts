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
}

export type EmberFullVersion = { ezsp: number; revision: string } & EmberVersion
export type ConfigValue = { [key: string]: string }

export type FirmwareVariant = 'latest' | 'official' | 'recommended'
export type FirmwareVersion = `${Digit}.${Digit}.${Digit}.${Digit}`
export type FirmwareFilename = `${string}.gbl`
export type FirmwareURL = `https://${string}/${FirmwareFilename}`

export type FirmwareMetadata = {
    settings: Omit<PortConf, 'path'>
    url: FirmwareURL | undefined
    version: FirmwareVersion
}

export type FirmwareFileMetadata = {
    baudrate: number // 115200
    ezsp_version: FirmwareVersion // '7.4.1.0'
    fw_type: string // 'ncp-uart-hw'
    metadata_version: number // 1
    sdk_version: `${Digit}.${Digit}.${Digit}` // '4.4.1'
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
