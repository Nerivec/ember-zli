import { EmberVersion } from "zigbee-herdsman/dist/adapter/ember/types.js"

import { BAUDRATES } from "./consts.js"

export type AdapterModel = 'Aeotec Zi-Stick (ZGA008)' | 'EasyIOT ZB-GW04 v1.1' | 'EasyIOT ZB-GW04 v1.2' | 'Home Assistant SkyConnect' |
    'Home Assistant Yellow' | 'SMLight SLZB06-M' | 'SMLight SLZB07' | 'Sonoff ZBDongle-E' | 'TubeZB MGM24'

export type PortType = 'serial' | 'tcp'
export type BaudRate = typeof BAUDRATES[number]

export type PortConf = {
    baudRate: number
    path: string
    rtscts: boolean
}

export type EmberFullVersion = {ezsp: number, revision: string} & EmberVersion
export type ConfigValue = { [key: string]: string }

export type FirmwareVersion = 'latest' | 'recommended'

export type FirmwareFilename = `${string}.gbl`

export type FirmwareURL = `https://${string}/${FirmwareFilename}`

export type FirmwareMetadata = {
    settings: Omit<PortConf, 'path'>
    url: FirmwareURL
    version: string
}

export type FirmwareFileMetadata = {
    baudrate: number // 115200
    ezsp_version: string // '7.4.1.0'
    fw_type: string // 'ncp-uart-hw'
    metadata_version: number // 1
    sdk_version: string // '4.4.1'
}
