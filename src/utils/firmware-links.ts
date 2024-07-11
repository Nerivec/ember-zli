import { AdapterModel, FirmwareMetadata, FirmwareVariant } from './types.js'

export const FIRMWARE_LINKS: Record<FirmwareVariant, Record<AdapterModel, FirmwareMetadata>> = {
    latest: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/aeotec-zga008/ncp-uart-hw-v7.4.3.0-aeotec-zga008-115200.gbl',
            version: '7.4.3.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/zb-gw04-1v1/ncp-uart-hw-v7.4.3.0-zb-gw04-1v1-115200.gbl',
            version: '7.4.3.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/zb-gw04-1v2/ncp-uart-hw-v7.4.3.0-zb-gw04-1v2-115200.gbl',
            version: '7.4.3.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/skyconnect/ncp-uart-hw-v7.4.3.0-skyconnect-115200.gbl',
            version: '7.4.3.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/yellow/ncp-uart-hw-v7.4.3.0-yellow-115200.gbl',
            version: '7.4.3.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/slzb-06m/ncp-uart-hw-v7.4.3.0-slzb-06m-115200.gbl',
            version: '7.4.3.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/slzb-07/ncp-uart-hw-v7.4.3.0-slzb-07-115200.gbl',
            version: '7.4.3.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/zbdonglee/ncp-uart-hw-v7.4.3.0-zbdonglee-115200.gbl',
            version: '7.4.3.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/tube0013/tube_gateways/raw/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.3/maxed_settings/tubesZB-EFR32-MGM24_NCP_7.4.3.gbl',
            version: '7.4.3.0',
        },
    },
    official: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined,
            version: '7.4.3.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: undefined,
            version: '7.4.3.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined,
            version: '7.4.3.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/NabuCasa/silabs-firmware-builder/releases/download/v4.4.2/skyconnect_ncp-uart-hw_7.4.2.0.gbl',
            version: '7.4.2.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/NabuCasa/silabs-firmware-builder/releases/download/v4.4.2/yellow_ncp-uart-hw_7.4.2.0.gbl',
            version: '7.4.2.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/slzb-06m/ncp-uart-hw-v7.4.3.0-slzb-06m-115200.gbl',
            version: '7.4.3.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/slzb-07/ncp-uart-hw-v7.4.3.0-slzb-07-115200.gbl',
            version: '7.4.3.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/master/Dongle-E/NCP_7.4.3/ncp-uart-sw_EZNet7.4.3_V1.0.0.gbl',
            version: '7.4.3.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/tube0013/tube_gateways/raw/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.3/maxed_settings/tubesZB-EFR32-MGM24_NCP_7.4.3.gbl',
            version: '7.4.3.0',
        },
    },
    recommended: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/aeotec-zga008/ncp-uart-hw-v7.4.3.0-aeotec-zga008-115200.gbl',
            version: '7.4.3.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/zb-gw04-1v1/ncp-uart-hw-v7.4.1.0-zb-gw04-1v1-115200.gbl',
            version: '7.4.1.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/zb-gw04-1v2/ncp-uart-hw-v7.4.1.0-zb-gw04-1v2-115200.gbl',
            version: '7.4.1.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/skyconnect/ncp-uart-hw-v7.4.1.0-skyconnect-115200.gbl',
            version: '7.4.1.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/yellow/ncp-uart-hw-v7.4.1.0-yellow-115200.gbl',
            version: '7.4.1.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/slzb-06m/ncp-uart-hw-v7.4.1.0-slzb-06m-115200.gbl',
            version: '7.4.1.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/ember-nohw/firmware_builds/slzb-07/ncp-uart-hw-v7.4.1.0-slzb-07-115200.gbl',
            version: '7.4.1.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/main/firmware_builds/zbdonglee/ncp-uart-hw-v7.4.1.0-zbdonglee-115200.gbl',
            version: '7.4.1.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/tube0013/tube_gateways/raw/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.1/tubesZB-EFR32-MGM24_NCP_7.4.1.gbl',
            version: '7.4.1.0',
        },
    },
}
