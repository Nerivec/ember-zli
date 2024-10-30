import type { checkbox, select } from '@inquirer/prompts'
import type { EmberKeyData, EmberVersion } from 'zigbee-herdsman/dist/adapter/ember/types.js'
import type { EUI64 } from 'zigbee-herdsman/dist/zspec/tstypes.js'

import { BAUDRATES } from './consts.js'
import { CpcSystemCommandId } from './enums.js'

// https://github.com/microsoft/TypeScript/issues/24509
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P] extends ReadonlyArray<infer U> ? Mutable<U>[] : Mutable<T[P]>
}

// types from inquirer/prompts are not exported
export type CheckboxChoices<Value> = Mutable<Parameters<typeof checkbox<Value>>[0]['choices']>
export type SelectChoices<Value> = Mutable<Parameters<typeof select<Value>>[0]['choices']>

export type AdapterModel =
    | 'Aeotec Zi-Stick (ZGA008)'
    | 'EasyIOT ZB-GW04 v1.1'
    | 'EasyIOT ZB-GW04 v1.2'
    | 'Home Assistant SkyConnect'
    | 'Home Assistant Yellow'
    | 'SMLight SLZB06-M'
    | 'SMLight SLZB07'
    | 'SMLight SLZB07mg24'
    | 'Sonoff ZBDongle-E'
    | 'Sonoff ZBDongle-E - ROUTER'
    | 'SparkFun MGM240p'
    | 'TubeZB MGM24'
    | 'TubeZB MGM24PB'

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

export type FirmwareVariant = 'latest' | 'official' | 'recommended' | 'experimental'
export type FirmwareVersion = `${number}.${number}.${number}.${number}`
export type FirmwareVersionShort = `${number}.${number}.${number}`
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
