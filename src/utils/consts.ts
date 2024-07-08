import { EmberApsOption } from 'zigbee-herdsman/dist/adapter/ember/enums.js'

import { StackConfig } from './types.js'

export const TCP_REGEX = /^tcp:\/\/[\w.-]+:\d+$/
export const BAUDRATES = [115200, 230400, 460800]
/** Read/write max bytes count at stream level */
export const CONFIG_HIGHWATER_MARK = 256

/**
 * Default stack configuration values.
 * @see https://www.silabs.com/documents/public/user-guides/ug100-ezsp-reference-guide.pdf 2.3.1 for descriptions/RAM costs
 *
 * https://github.com/darkxst/silabs-firmware-builder/tree/main/manifests
 * https://github.com/NabuCasa/silabs-firmware/wiki/Zigbee-EmberZNet-NCP-firmware-configuration#skyconnect
 * https://github.com/SiliconLabs/UnifySDK/blob/main/applications/zigbeed/project_files/zigbeed.slcp
 */
export const DEFAULT_CONF_STACK: Readonly<StackConfig> = {
    CONCENTRATOR_RAM_TYPE: 'high',
    CONCENTRATOR_MIN_TIME: 5, // zigpc: 10
    CONCENTRATOR_MAX_TIME: 60, // zigpc: 60
    CONCENTRATOR_ROUTE_ERROR_THRESHOLD: 3, // zigpc: 3
    CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD: 1, // zigpc: 1, ZigbeeMinimalHost: 3
    CONCENTRATOR_MAX_HOPS: 0, // zigpc: 0
    MAX_END_DEVICE_CHILDREN: 32, // zigpc: 6, nabucasa: 32, Dongle-E (Sonoff firmware): 32
    TRANSIENT_DEVICE_TIMEOUT: 10000,
    END_DEVICE_POLL_TIMEOUT: 8, // zigpc: 8
    TRANSIENT_KEY_TIMEOUT_S: 300, // zigpc: 65535
}
/** Default behavior is to disable app key requests */
export const ALLOW_APP_KEY_REQUESTS = false

export const DEFAULT_APS_OPTIONS = EmberApsOption.RETRY | EmberApsOption.ENABLE_ROUTE_DISCOVERY | EmberApsOption.ENABLE_ADDRESS_DISCOVERY

export const APPLICATION_ZDO_SEQUENCE_MASK = 0x7f
export const DEFAULT_ZDO_REQUEST_RADIUS = 0xff
