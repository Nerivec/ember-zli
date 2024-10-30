import type { AdapterModel, FirmwareMetadata, FirmwareVariant } from './types.js'

export const FIRMWARE_LINKS: Record<FirmwareVariant, Record<AdapterModel, FirmwareMetadata>> = {
    recommended: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/aeotec-zga008/ncp-uart-hw-v7.4.4.0-aeotec-zga008-115200.gbl',
            version: '7.4.4.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/zb-gw04-1v1/ncp-uart-hw-v7.4.4.0-zb-gw04-1v1-115200.gbl',
            version: '7.4.4.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/zb-gw04-1v2/ncp-uart-hw-v7.4.4.0-zb-gw04-1v2-115200.gbl',
            version: '7.4.4.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/NabuCasa/silabs-firmware-builder/releases/download/v2024.8.20/skyconnect_ncp-uart-hw_7.4.4.0.gbl',
            version: '7.4.4.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/NabuCasa/silabs-firmware-builder/releases/download/v2024.8.20/yellow_ncp-uart-hw_7.4.4.0.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-06m/ncp-uart-hw-v7.4.4.0-slzb-06m-115200.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-07/ncp-uart-hw-v7.4.4.0-slzb-07-115200.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB07mg24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-07mg24/ncp-uart-hw-v7.4.4.0-slzb-07mg24-115200.gbl',
            version: '7.4.4.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/zbdonglee/ncp-uart-hw-v7.4.4.0-zbdonglee-115200.gbl',
            version: '7.4.4.0',
        },
        'Sonoff ZBDongle-E - ROUTER': {
            settings: { baudRate: 115200, rtscts: false },
            url: `https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/refs/heads/master/Dongle-E/Router/Z3RouterUSBDonlge_EZNet6.10.3_V1.0.0.gbl`,
            version: '6.10.3.0',
        },
        'SparkFun MGM240p': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/mgm240p/ncp-uart-hw-v7.4.4.0-mgm240p-115200.gbl',
            version: '7.4.4.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/tube0013/tube_gateways/raw/refs/heads/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.3/maxed_settings/tubesZB-EFR32-MGM24_NCP_7.4.3.gbl',
            version: '7.4.3.0',
        },
        'TubeZB MGM24PB': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined,
            version: '7.4.3.0',
        },
    },
    latest: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/aeotec-zga008/ncp-uart-hw-v7.4.4.0-aeotec-zga008-115200.gbl',
            version: '7.4.4.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/zb-gw04-1v1/ncp-uart-hw-v7.4.4.0-zb-gw04-1v1-115200.gbl',
            version: '7.4.4.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/zb-gw04-1v2/ncp-uart-hw-v7.4.4.0-zb-gw04-1v2-115200.gbl',
            version: '7.4.4.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/NabuCasa/silabs-firmware-builder/releases/download/v2024.8.20/skyconnect_ncp-uart-hw_7.4.4.0.gbl',
            version: '7.4.4.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/NabuCasa/silabs-firmware-builder/releases/download/v2024.8.20/yellow_ncp-uart-hw_7.4.4.0.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-06m/ncp-uart-hw-v7.4.4.0-slzb-06m-115200.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-07/ncp-uart-hw-v7.4.4.0-slzb-07-115200.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB07mg24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-07mg24/ncp-uart-hw-v7.4.4.0-slzb-07mg24-115200.gbl',
            version: '7.4.4.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/zbdonglee/ncp-uart-hw-v7.4.4.0-zbdonglee-115200.gbl',
            version: '7.4.4.0',
        },
        'Sonoff ZBDongle-E - ROUTER': {
            settings: { baudRate: 115200, rtscts: false },
            url: `https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/refs/heads/master/Dongle-E/Router/Z3RouterUSBDonlge_EZNet6.10.3_V1.0.0.gbl`,
            version: '6.10.3.0',
        },
        'SparkFun MGM240p': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/mgm240p/ncp-uart-hw-v7.4.4.0-mgm240p-115200.gbl',
            version: '7.4.4.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/tube0013/tube_gateways/raw/refs/heads/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.3/maxed_settings/tubesZB-EFR32-MGM24_NCP_7.4.3.gbl',
            version: '7.4.3.0',
        },
        'TubeZB MGM24PB': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined,
            version: '7.4.3.0',
        },
    },
    official: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined,
            version: '7.4.4.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: undefined,
            version: '7.4.4.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined,
            version: '7.4.4.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/NabuCasa/silabs-firmware-builder/releases/download/v2024.8.20/skyconnect_ncp-uart-hw_7.4.4.0.gbl',
            version: '7.4.4.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/NabuCasa/silabs-firmware-builder/releases/download/v2024.8.20/yellow_ncp-uart-hw_7.4.4.0.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-06m/ncp-uart-hw-v7.4.4.0-slzb-06m-115200.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-07/ncp-uart-hw-v7.4.4.0-slzb-07-115200.gbl',
            version: '7.4.4.0',
        },
        'SMLight SLZB07mg24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/darkxst/silabs-firmware-builder/raw/refs/heads/main/firmware_builds/slzb-07mg24/ncp-uart-hw-v7.4.4.0-slzb-07mg24-115200.gbl',
            version: '7.4.4.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: 'https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/refs/heads/master/Dongle-E/NCP_7.4.3/ncp-uart-sw_EZNet7.4.3_V1.0.0.gbl',
            version: '7.4.3.0',
        },
        'Sonoff ZBDongle-E - ROUTER': {
            settings: { baudRate: 115200, rtscts: false },
            url: `https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/refs/heads/master/Dongle-E/Router/Z3RouterUSBDonlge_EZNet6.10.3_V1.0.0.gbl`,
            version: '6.10.3.0',
        },
        'SparkFun MGM240p': {
            settings: { baudRate: 115200, rtscts: false },
            url: undefined,
            version: '7.4.4.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: true },
            url: 'https://github.com/tube0013/tube_gateways/raw/refs/heads/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.3/maxed_settings/tubesZB-EFR32-MGM24_NCP_7.4.3.gbl',
            version: '7.4.3.0',
        },
        'TubeZB MGM24PB': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined,
            version: '7.4.3.0',
        },
    },
    experimental: {
        'Aeotec Zi-Stick (ZGA008)': {
            settings: { baudRate: 115200, rtscts: true },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/aeotec_zga008_zigbee_ncp_8.0.2.0_115200.gbl`,
            version: '8.0.2.0',
        },
        'EasyIOT ZB-GW04 v1.1': {
            settings: { baudRate: 115200, rtscts: false },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/easyiot_zb-gw04-1v1_zigbee_ncp_8.0.2.0_115200_sw_flow.gbl`,
            version: '8.0.2.0',
        },
        'EasyIOT ZB-GW04 v1.2': {
            settings: { baudRate: 115200, rtscts: true },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/easyiot_zb-gw04-1v2_zigbee_ncp_8.0.2.0_115200.gbl`,
            version: '8.0.2.0',
        },
        'Home Assistant SkyConnect': {
            settings: { baudRate: 115200, rtscts: true },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/nabucasa_skyconnect_zigbee_ncp_8.0.2.0_115200.gbl`,
            version: '8.0.2.0',
        },
        'Home Assistant Yellow': {
            settings: { baudRate: 115200, rtscts: true },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/nabucasa_yellow_zigbee_ncp_8.0.2.0_115200.gbl`,
            version: '8.0.2.0',
        },
        'SMLight SLZB06-M': {
            settings: { baudRate: 115200, rtscts: false },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/smlight_slzb06m_zigbee_ncp_8.0.2.0_115200_sw_flow.gbl`,
            version: '8.0.2.0',
        },
        'SMLight SLZB07': {
            settings: { baudRate: 115200, rtscts: true },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/smlight_slzb07_zigbee_ncp_8.0.2.0_115200.gbl`,
            version: '8.0.2.0',
        },
        'SMLight SLZB07mg24': {
            settings: { baudRate: 115200, rtscts: true },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/smlight_slzb07Mg24_zigbee_ncp_8.0.2.0_115200.gbl`,
            version: '8.0.2.0',
        },
        'Sonoff ZBDongle-E': {
            settings: { baudRate: 115200, rtscts: false },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/sonoff_zbdonglee_zigbee_ncp_8.0.2.0_115200_sw_flow.gbl`,
            version: '8.0.2.0',
        },
        'Sonoff ZBDongle-E - ROUTER': {
            settings: { baudRate: 115200, rtscts: false },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/sonoff_zbdonglee_zigbee_router_8.0.2.0_115200_sw_flow.gbl`,
            version: '8.0.2.0',
        },
        'SparkFun MGM240p': {
            settings: { baudRate: 115200, rtscts: false },
            url: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/sparkfun_mgm240p_zigbee_ncp_8.0.2.0_115200_sw_flow.gbl`,
            version: '8.0.2.0',
        },
        'TubeZB MGM24': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined, // NOT WORKING: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/tubeszb-mgm24-zigbee_ncp_8.0.2.0_115200.gbl`,
            version: '8.0.2.0',
        },
        'TubeZB MGM24PB': {
            settings: { baudRate: 115200, rtscts: true },
            url: undefined, // NOT WORKING: `https://github.com/Nerivec/silabs-firmware-builder/releases/download/v2024.6.2-update1/tubeszb-mgm24PB-zigbee_ncp_8.0.2.0_115200.gbl`,
            version: '8.0.2.0',
        },
    },
}
