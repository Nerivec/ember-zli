import type { AdapterModel, FirmwareVariant, GithubReleaseJson } from './types.js'

import { writeFileSync } from 'fs'
import path from 'path'

import { fetchJson } from './utils.js'

const GITHUB_REPOS_API = `https://api.github.com/repos/`
const GITHUB_RELEASES_ENDPOINT = `/releases`

const NABUCASA_REPO = `NabuCasa/silabs-firmware-builder`
const DARKXST_REPO = `darkxst/silabs-firmware-builder`
const NERIVEC_REPO = `Nerivec/silabs-firmware-builder`
// const TUBE0013_REPO = `tube0013/silabs-firmware-builder`

// const FIRMWARE_BOOTLOADER = `bootloader`
const FIRMWARE_ZIGBEE_NCP = `zigbee_ncp`
const FIRMWARE_ZIGBEE_ROUTER = `zigbee_router`

const NABUCASA_RELEASE = await getLatestGithubRelease(NABUCASA_REPO)
const DARKXST_RELEASE = await getLatestGithubRelease(DARKXST_REPO)
const NERIVEC_RELEASE = await getLatestGithubRelease(NERIVEC_REPO)
// const TUBE0013_REPO = await getLatestGithubRelease(TUBE0013_REPO)

async function getLatestGithubRelease(repo: string): Promise<GithubReleaseJson> {
    const response = await fetchJson<GithubReleaseJson[]>(GITHUB_REPOS_API + path.posix.join(repo, GITHUB_RELEASES_ENDPOINT))

    return response[0]
}

function findFirmware(release: GithubReleaseJson, model: string, type: string): string | undefined {
    const firmware = release.assets.find((asset) => asset.name.startsWith(model) && asset.name.includes(type))

    return firmware?.browser_download_url
}

const firmwareLinks: Record<FirmwareVariant, Record<AdapterModel, string | undefined>> = {
    latest: {
        //-- FIRMWARE_ZIGBEE_NCP
        'Aeotec Zi-Stick (ZGA008)': findFirmware(DARKXST_RELEASE, 'zga008', FIRMWARE_ZIGBEE_NCP),

        'EasyIOT ZB-GW04 v1.1': findFirmware(DARKXST_RELEASE, 'zb-gw04-1v1', FIRMWARE_ZIGBEE_NCP),
        'EasyIOT ZB-GW04 v1.2': findFirmware(DARKXST_RELEASE, 'zb-gw04-1v2', FIRMWARE_ZIGBEE_NCP),

        'Nabu Casa SkyConnect': findFirmware(NABUCASA_RELEASE, 'skyconnect', FIRMWARE_ZIGBEE_NCP),
        'Nabu Casa Yellow': findFirmware(NABUCASA_RELEASE, 'yellow', FIRMWARE_ZIGBEE_NCP),

        'SMLight SLZB06-M': findFirmware(DARKXST_RELEASE, 'slzb06m', FIRMWARE_ZIGBEE_NCP),
        // avoid matching on mg24 variant with `_`
        'SMLight SLZB07': findFirmware(DARKXST_RELEASE, 'slzb07_', FIRMWARE_ZIGBEE_NCP),
        'SMLight SLZB07mg24': findFirmware(DARKXST_RELEASE, 'slzb07Mg24', FIRMWARE_ZIGBEE_NCP),

        'Sonoff ZBDongle-E': findFirmware(DARKXST_RELEASE, 'zbdonglee', FIRMWARE_ZIGBEE_NCP),

        'SparkFun MGM240p': findFirmware(DARKXST_RELEASE, 'mgm240p', FIRMWARE_ZIGBEE_NCP),

        // avoid matching on PB variant with `-`
        'TubeZB MGM24': `https://github.com/tube0013/tube_gateways/raw/refs/heads/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.4/tubeszb-mgm24-hw-max_ncp-uart-hw_7.4.4.0.gbl`, // findFirmware(TUBE0013_RELEASE, 'mgm24-', FIRMWARE_ZIGBEE_NCP),
        'TubeZB MGM24PB': undefined, // findFirmware(TUBE0013_RELEASE, 'mgm24pb-', FIRMWARE_ZIGBEE_NCP),

        //-- FIRMWARE_ZIGBEE_ROUTER
        'ROUTER - Aeotec Zi-Stick (ZGA008)': undefined, // findFirmware(DARKXST_RELEASE, 'zga008', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - EasyIOT ZB-GW04 v1.1': undefined, // findFirmware(DARKXST_RELEASE, 'zb-gw04-1v1', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - EasyIOT ZB-GW04 v1.2': undefined, // findFirmware(DARKXST_RELEASE, 'zb-gw04-1v2', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - Nabu Casa SkyConnect': undefined, // findFirmware(NABUCASA_RELEASE, 'skyconnect', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - Nabu Casa Yellow': undefined, // findFirmware(NABUCASA_RELEASE, 'yellow', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - SMLight SLZB06-M': undefined, // findFirmware(DARKXST_RELEASE, 'slzb06m', FIRMWARE_ZIGBEE_ROUTER),
        // avoid matching on mg24 variant with `_`
        'ROUTER - SMLight SLZB07': undefined, // findFirmware(DARKXST_RELEASE, 'slzb07_', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - SMLight SLZB07mg24': undefined, // findFirmware(DARKXST_RELEASE, 'slzb07Mg24', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - Sonoff ZBDongle-E': undefined, // findFirmware(DARKXST_RELEASE, 'zbdonglee', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - SparkFun MGM240p': undefined, // findFirmware(DARKXST_RELEASE, 'mgm240p', FIRMWARE_ZIGBEE_ROUTER),

        // avoid matching on variants with `-`
        'ROUTER - TubeZB MGM24': undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24-', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - TubeZB MGM24PB': undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24PB-', FIRMWARE_ZIGBEE_ROUTER),
    },
    official: {
        //-- FIRMWARE_ZIGBEE_NCP
        'Aeotec Zi-Stick (ZGA008)': undefined,

        'EasyIOT ZB-GW04 v1.1': undefined,
        'EasyIOT ZB-GW04 v1.2': undefined,

        'Nabu Casa SkyConnect': findFirmware(NABUCASA_RELEASE, 'skyconnect', FIRMWARE_ZIGBEE_NCP),
        'Nabu Casa Yellow': findFirmware(NABUCASA_RELEASE, 'yellow', FIRMWARE_ZIGBEE_NCP),

        'SMLight SLZB06-M': findFirmware(DARKXST_RELEASE, 'slzb06m', FIRMWARE_ZIGBEE_NCP),
        // avoid matching on mg24 variant with `_`
        'SMLight SLZB07': findFirmware(DARKXST_RELEASE, 'slzb07_', FIRMWARE_ZIGBEE_NCP),
        'SMLight SLZB07mg24': findFirmware(DARKXST_RELEASE, 'slzb07Mg24', FIRMWARE_ZIGBEE_NCP),

        'Sonoff ZBDongle-E': `https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/refs/heads/master/Dongle-E/NCP_7.4.3/ncp-uart-sw_EZNet7.4.3_V1.0.0.gbl`,

        'SparkFun MGM240p': undefined,

        // avoid matching on PB variant with `-`
        'TubeZB MGM24': `https://github.com/tube0013/tube_gateways/raw/refs/heads/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.4/tubeszb-mgm24-hw-max_ncp-uart-hw_7.4.4.0.gbl`, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24-', FIRMWARE_ZIGBEE_NCP),
        'TubeZB MGM24PB': undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24pb-', FIRMWARE_ZIGBEE_NCP),

        //-- FIRMWARE_ZIGBEE_ROUTER
        'ROUTER - Aeotec Zi-Stick (ZGA008)': undefined,

        'ROUTER - EasyIOT ZB-GW04 v1.1': undefined,
        'ROUTER - EasyIOT ZB-GW04 v1.2': undefined,

        'ROUTER - Nabu Casa SkyConnect': undefined, // findFirmware(NABUCASA_RELEASE, 'skyconnect', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - Nabu Casa Yellow': undefined, // findFirmware(NABUCASA_RELEASE, 'yellow', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - SMLight SLZB06-M': undefined, // findFirmware(DARKXST_RELEASE, 'slzb06m', FIRMWARE_ZIGBEE_ROUTER),
        // avoid matching on mg24 variant with `_`
        'ROUTER - SMLight SLZB07': undefined, // findFirmware(DARKXST_RELEASE, 'slzb07_', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - SMLight SLZB07mg24': undefined, // findFirmware(DARKXST_RELEASE, 'slzb07Mg24', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - Sonoff ZBDongle-E': `https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/refs/heads/master/Dongle-E/Router/Z3RouterUSBDonlge_EZNet6.10.3_V1.0.0.gbl`,

        'ROUTER - SparkFun MGM240p': undefined,

        // avoid matching on variants with `-`
        'ROUTER - TubeZB MGM24': undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24-', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - TubeZB MGM24PB': undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24PB-', FIRMWARE_ZIGBEE_ROUTER),
    },
    experimental: {
        //-- FIRMWARE_ZIGBEE_NCP
        'Aeotec Zi-Stick (ZGA008)': findFirmware(NERIVEC_RELEASE, 'aeotec_zga008', FIRMWARE_ZIGBEE_NCP),

        'EasyIOT ZB-GW04 v1.1': findFirmware(NERIVEC_RELEASE, 'easyiot_zb-gw04-1v1', FIRMWARE_ZIGBEE_NCP),
        'EasyIOT ZB-GW04 v1.2': findFirmware(NERIVEC_RELEASE, 'easyiot_zb-gw04-1v2', FIRMWARE_ZIGBEE_NCP),

        'Nabu Casa SkyConnect': findFirmware(NERIVEC_RELEASE, 'nabucasa_skyconnect', FIRMWARE_ZIGBEE_NCP),
        'Nabu Casa Yellow': findFirmware(NERIVEC_RELEASE, 'nabucasa_yellow', FIRMWARE_ZIGBEE_NCP),

        'SMLight SLZB06-M': findFirmware(NERIVEC_RELEASE, 'smlight_slzb06m', FIRMWARE_ZIGBEE_NCP),
        // avoid matching on mg24 variant with `_`
        'SMLight SLZB07': findFirmware(NERIVEC_RELEASE, 'smlight_slzb07_', FIRMWARE_ZIGBEE_NCP),
        'SMLight SLZB07mg24': findFirmware(NERIVEC_RELEASE, 'smlight_slzb07Mg24', FIRMWARE_ZIGBEE_NCP),

        'Sonoff ZBDongle-E': findFirmware(NERIVEC_RELEASE, 'sonoff_zbdonglee', FIRMWARE_ZIGBEE_NCP),

        'SparkFun MGM240p': findFirmware(NERIVEC_RELEASE, 'sparkfun_mgm240p', FIRMWARE_ZIGBEE_NCP),
        // avoid matching on variants with `-`
        'TubeZB MGM24': findFirmware(NERIVEC_RELEASE, 'tubeszb-mgm24-', FIRMWARE_ZIGBEE_NCP),
        'TubeZB MGM24PB': findFirmware(NERIVEC_RELEASE, 'tubeszb-mgm24PB-', FIRMWARE_ZIGBEE_NCP),

        //-- FIRMWARE_ZIGBEE_ROUTER
        'ROUTER - Aeotec Zi-Stick (ZGA008)': findFirmware(NERIVEC_RELEASE, 'aeotec_zga008', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - EasyIOT ZB-GW04 v1.1': findFirmware(NERIVEC_RELEASE, 'easyiot_zb-gw04-1v1', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - EasyIOT ZB-GW04 v1.2': findFirmware(NERIVEC_RELEASE, 'easyiot_zb-gw04-1v2', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - Nabu Casa SkyConnect': findFirmware(NERIVEC_RELEASE, 'nabucasa_skyconnect', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - Nabu Casa Yellow': findFirmware(NERIVEC_RELEASE, 'nabucasa_yellow', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - SMLight SLZB06-M': findFirmware(NERIVEC_RELEASE, 'smlight_slzb06m', FIRMWARE_ZIGBEE_ROUTER),
        // avoid matching on mg24 variant with `_`
        'ROUTER - SMLight SLZB07': findFirmware(NERIVEC_RELEASE, 'smlight_slzb07_', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - SMLight SLZB07mg24': findFirmware(NERIVEC_RELEASE, 'smlight_slzb07Mg24', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - Sonoff ZBDongle-E': findFirmware(NERIVEC_RELEASE, 'sonoff_zbdonglee', FIRMWARE_ZIGBEE_ROUTER),

        'ROUTER - SparkFun MGM240p': findFirmware(NERIVEC_RELEASE, 'sparkfun_mgm240p', FIRMWARE_ZIGBEE_ROUTER),

        // avoid matching on variants with `-`
        'ROUTER - TubeZB MGM24': findFirmware(NERIVEC_RELEASE, 'tubeszb-mgm24-', FIRMWARE_ZIGBEE_ROUTER),
        'ROUTER - TubeZB MGM24PB': findFirmware(NERIVEC_RELEASE, 'tubeszb-mgm24PB-', FIRMWARE_ZIGBEE_ROUTER),
    },
}

writeFileSync('firmware-links.json', JSON.stringify(firmwareLinks, undefined, 4), 'utf8')
