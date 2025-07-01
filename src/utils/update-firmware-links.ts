import { writeFileSync } from "node:fs";
import path from "node:path";
import type { AdapterModel, FirmwareVariant, GithubReleaseJson } from "./types.js";

import { fetchJson } from "./utils.js";

const GITHUB_REPOS_API = "https://api.github.com/repos/";
const GITHUB_RELEASES_ENDPOINT = "/releases";

const NABUCASA_REPO = "NabuCasa/silabs-firmware-builder";
const DARKXST_REPO = "darkxst/silabs-firmware-builder";
const NERIVEC_REPO = "Nerivec/silabs-firmware-builder";
const NERIVEC_RECOVERY_REPO = "Nerivec/silabs-firmware-recovery";
// const TUBE0013_REPO = "tube0013/silabs-firmware-builder"

// const FIRMWARE_BOOTLOADER = "bootloader"
const FIRMWARE_ZIGBEE_NCP = "zigbee_ncp";
const FIRMWARE_ZIGBEE_ROUTER = "zigbee_router";

const NABUCASA_RELEASE = await getLatestGithubRelease(NABUCASA_REPO);
const DARKXST_RELEASE = await getLatestGithubRelease(DARKXST_REPO);
const NERIVEC_RELEASE = await getLatestGithubRelease(NERIVEC_REPO);
const NERIVEC_RECOVERY_RELEASE = await getLatestGithubRelease(NERIVEC_RECOVERY_REPO);
// const TUBE0013_REPO = await getLatestGithubRelease(TUBE0013_REPO)

async function getLatestGithubRelease(repo: string): Promise<GithubReleaseJson> {
    const response = await fetchJson<GithubReleaseJson[]>(GITHUB_REPOS_API + path.posix.join(repo, GITHUB_RELEASES_ENDPOINT));
    let i = 0;
    let release = response[i++];

    while (release.prerelease || release.draft) {
        release = response[i++];
    }

    return release;
}

function findFirmware(release: GithubReleaseJson, model: string, include: string | string[]): string | undefined {
    const includeArr = Array.isArray(include) ? include : [include];
    const firmware = release.assets.find((asset) => asset.name.startsWith(model) && includeArr.every((i) => asset.name.includes(i)));

    return firmware?.browser_download_url;
}

const firmwareLinks: Record<FirmwareVariant, Record<AdapterModel, string | undefined>> = {
    latest: {
        //-- FIRMWARE_ZIGBEE_NCP
        "Aeotec Zi-Stick (ZGA008)": findFirmware(DARKXST_RELEASE, "zga008", FIRMWARE_ZIGBEE_NCP),

        "EasyIOT ZB-GW04 v1.1": findFirmware(DARKXST_RELEASE, "zb-gw04-1v1", FIRMWARE_ZIGBEE_NCP),
        "EasyIOT ZB-GW04 v1.2": findFirmware(DARKXST_RELEASE, "zb-gw04-1v2", FIRMWARE_ZIGBEE_NCP),

        "Nabu Casa SkyConnect": findFirmware(NABUCASA_RELEASE, "skyconnect", FIRMWARE_ZIGBEE_NCP),
        "Nabu Casa Yellow": findFirmware(NABUCASA_RELEASE, "yellow", FIRMWARE_ZIGBEE_NCP),

        "SMLight SLZB06-M": findFirmware(DARKXST_RELEASE, "slzb06m", FIRMWARE_ZIGBEE_NCP),
        "SMLight SLZB06mg24": findFirmware(DARKXST_RELEASE, "slzb06Mg24", FIRMWARE_ZIGBEE_NCP),
        // avoid matching on mg24 variant with `_`
        "SMLight SLZB07": findFirmware(DARKXST_RELEASE, "slzb07_", FIRMWARE_ZIGBEE_NCP),
        "SMLight SLZB07mg24": findFirmware(DARKXST_RELEASE, "slzb07Mg24", FIRMWARE_ZIGBEE_NCP),

        "Sonoff ZBDongle-E": findFirmware(DARKXST_RELEASE, "zbdonglee", FIRMWARE_ZIGBEE_NCP),

        "SparkFun MGM240p": findFirmware(DARKXST_RELEASE, "mgm240p", FIRMWARE_ZIGBEE_NCP),

        // avoid matching on PB variant with `-`
        "TubeZB MGM24":
            "https://github.com/tube0013/tube_gateways/raw/refs/heads/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.4/tubeszb-mgm24-hw-max_ncp-uart-hw_7.4.4.0.gbl", // findFirmware(TUBE0013_RELEASE, 'mgm24-', FIRMWARE_ZIGBEE_NCP),
        "TubeZB MGM24PB": undefined, // findFirmware(TUBE0013_RELEASE, 'mgm24pb-', FIRMWARE_ZIGBEE_NCP),

        //-- FIRMWARE_ZIGBEE_ROUTER
        "ROUTER - Aeotec Zi-Stick (ZGA008)": undefined, // findFirmware(DARKXST_RELEASE, 'zga008', FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - EasyIOT ZB-GW04 v1.1": undefined, // findFirmware(DARKXST_RELEASE, 'zb-gw04-1v1', FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - EasyIOT ZB-GW04 v1.2": undefined, // findFirmware(DARKXST_RELEASE, 'zb-gw04-1v2', FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - Nabu Casa SkyConnect": undefined, // findFirmware(NABUCASA_RELEASE, 'skyconnect', FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - Nabu Casa Yellow": undefined, // findFirmware(NABUCASA_RELEASE, 'yellow', FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - SMLight SLZB06-M": findFirmware(DARKXST_RELEASE, "slzb06m", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - SMLight SLZB06mg24": findFirmware(DARKXST_RELEASE, "slzb06Mg24", FIRMWARE_ZIGBEE_ROUTER),
        // avoid matching on mg24 variant with `_`
        "ROUTER - SMLight SLZB07": findFirmware(DARKXST_RELEASE, "slzb07_", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - SMLight SLZB07mg24": findFirmware(DARKXST_RELEASE, "slzb07Mg24", FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - Sonoff ZBDongle-E": undefined, // findFirmware(DARKXST_RELEASE, 'zbdonglee', FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - SparkFun MGM240p": undefined, // findFirmware(DARKXST_RELEASE, 'mgm240p', FIRMWARE_ZIGBEE_ROUTER),

        // avoid matching on variants with `-`
        "ROUTER - TubeZB MGM24": undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24-', FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - TubeZB MGM24PB": undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24PB-', FIRMWARE_ZIGBEE_ROUTER),
    },
    official: {
        //-- FIRMWARE_ZIGBEE_NCP
        "Aeotec Zi-Stick (ZGA008)": undefined,

        "EasyIOT ZB-GW04 v1.1": undefined,
        "EasyIOT ZB-GW04 v1.2": undefined,

        "Nabu Casa SkyConnect": findFirmware(NABUCASA_RELEASE, "skyconnect", FIRMWARE_ZIGBEE_NCP),
        "Nabu Casa Yellow": findFirmware(NABUCASA_RELEASE, "yellow", FIRMWARE_ZIGBEE_NCP),

        "SMLight SLZB06-M": findFirmware(DARKXST_RELEASE, "slzb06m", FIRMWARE_ZIGBEE_NCP),
        "SMLight SLZB06mg24": findFirmware(DARKXST_RELEASE, "slzb06Mg24", FIRMWARE_ZIGBEE_NCP),
        // avoid matching on mg24 variant with `_`
        "SMLight SLZB07": findFirmware(DARKXST_RELEASE, "slzb07_", FIRMWARE_ZIGBEE_NCP),
        "SMLight SLZB07mg24": findFirmware(DARKXST_RELEASE, "slzb07Mg24", FIRMWARE_ZIGBEE_NCP),

        "Sonoff ZBDongle-E":
            "https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/refs/heads/master/Dongle-E/NCP_7.4.4/ncp-uart-sw_EZNet7.4.4_V1.0.0.gbl",

        "SparkFun MGM240p": undefined,

        // avoid matching on PB variant with `-`
        "TubeZB MGM24":
            "https://github.com/tube0013/tube_gateways/raw/refs/heads/main/models/current/tubeszb-efr32-MGM24/firmware/mgm24/ncp/4.4.4/tubeszb-mgm24-hw-max_ncp-uart-hw_7.4.4.0.gbl", // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24-', FIRMWARE_ZIGBEE_NCP),
        "TubeZB MGM24PB": undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24pb-', FIRMWARE_ZIGBEE_NCP),

        //-- FIRMWARE_ZIGBEE_ROUTER
        "ROUTER - Aeotec Zi-Stick (ZGA008)": undefined,

        "ROUTER - EasyIOT ZB-GW04 v1.1": undefined,
        "ROUTER - EasyIOT ZB-GW04 v1.2": undefined,

        "ROUTER - Nabu Casa SkyConnect": undefined, // findFirmware(NABUCASA_RELEASE, 'skyconnect', FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - Nabu Casa Yellow": undefined, // findFirmware(NABUCASA_RELEASE, 'yellow', FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - SMLight SLZB06-M": findFirmware(DARKXST_RELEASE, "slzb06m", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - SMLight SLZB06mg24": findFirmware(DARKXST_RELEASE, "slzb06Mg24", FIRMWARE_ZIGBEE_ROUTER),
        // avoid matching on mg24 variant with `_`
        "ROUTER - SMLight SLZB07": findFirmware(DARKXST_RELEASE, "slzb07_", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - SMLight SLZB07mg24": findFirmware(DARKXST_RELEASE, "slzb07Mg24", FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - Sonoff ZBDongle-E":
            "https://github.com/itead/Sonoff_Zigbee_Dongle_Firmware/raw/refs/heads/master/Dongle-E/Router/Z3RouterUSBDonlge_EZNet6.10.3_V1.0.0.gbl",

        "ROUTER - SparkFun MGM240p": undefined,

        // avoid matching on variants with `-`
        "ROUTER - TubeZB MGM24": undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24-', FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - TubeZB MGM24PB": undefined, // findFirmware(TUBE0013_RELEASE, 'tubeszb-mgm24PB-', FIRMWARE_ZIGBEE_ROUTER),
    },
    experimental: {
        //-- FIRMWARE_ZIGBEE_NCP
        "Aeotec Zi-Stick (ZGA008)": findFirmware(NERIVEC_RELEASE, "aeotec_zga008", FIRMWARE_ZIGBEE_NCP),

        "EasyIOT ZB-GW04 v1.1": findFirmware(NERIVEC_RELEASE, "easyiot_zb-gw04-1v1", FIRMWARE_ZIGBEE_NCP),
        "EasyIOT ZB-GW04 v1.2": findFirmware(NERIVEC_RELEASE, "easyiot_zb-gw04-1v2", FIRMWARE_ZIGBEE_NCP),

        "Nabu Casa SkyConnect": findFirmware(NERIVEC_RELEASE, "nabucasa_skyconnect", FIRMWARE_ZIGBEE_NCP),
        "Nabu Casa Yellow": findFirmware(NERIVEC_RELEASE, "nabucasa_yellow", FIRMWARE_ZIGBEE_NCP),

        "SMLight SLZB06-M": findFirmware(NERIVEC_RELEASE, "smlight_slzb06m", FIRMWARE_ZIGBEE_NCP),
        "SMLight SLZB06mg24": findFirmware(NERIVEC_RELEASE, "smlight_slzb06Mg24", FIRMWARE_ZIGBEE_NCP),
        // avoid matching on mg24 variant with `_`
        "SMLight SLZB07": findFirmware(NERIVEC_RELEASE, "smlight_slzb07_", FIRMWARE_ZIGBEE_NCP),
        "SMLight SLZB07mg24": findFirmware(NERIVEC_RELEASE, "smlight_slzb07Mg24", FIRMWARE_ZIGBEE_NCP),

        "Sonoff ZBDongle-E": findFirmware(NERIVEC_RELEASE, "sonoff_zbdonglee", FIRMWARE_ZIGBEE_NCP),

        "SparkFun MGM240p": findFirmware(NERIVEC_RELEASE, "sparkfun_mgm240p", FIRMWARE_ZIGBEE_NCP),
        // avoid matching on variants with `-`
        "TubeZB MGM24": findFirmware(NERIVEC_RELEASE, "tubeszb-mgm24-", FIRMWARE_ZIGBEE_NCP),
        "TubeZB MGM24PB": findFirmware(NERIVEC_RELEASE, "tubeszb-mgm24PB-", FIRMWARE_ZIGBEE_NCP),

        //-- FIRMWARE_ZIGBEE_ROUTER
        "ROUTER - Aeotec Zi-Stick (ZGA008)": findFirmware(NERIVEC_RELEASE, "aeotec_zga008", FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - EasyIOT ZB-GW04 v1.1": findFirmware(NERIVEC_RELEASE, "easyiot_zb-gw04-1v1", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - EasyIOT ZB-GW04 v1.2": findFirmware(NERIVEC_RELEASE, "easyiot_zb-gw04-1v2", FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - Nabu Casa SkyConnect": findFirmware(NERIVEC_RELEASE, "nabucasa_skyconnect", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - Nabu Casa Yellow": findFirmware(NERIVEC_RELEASE, "nabucasa_yellow", FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - SMLight SLZB06-M": findFirmware(NERIVEC_RELEASE, "smlight_slzb06m", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - SMLight SLZB06mg24": findFirmware(NERIVEC_RELEASE, "smlight_slzb06Mg24", FIRMWARE_ZIGBEE_ROUTER),
        // avoid matching on mg24 variant with `_`
        "ROUTER - SMLight SLZB07": findFirmware(NERIVEC_RELEASE, "smlight_slzb07_", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - SMLight SLZB07mg24": findFirmware(NERIVEC_RELEASE, "smlight_slzb07Mg24", FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - Sonoff ZBDongle-E": findFirmware(NERIVEC_RELEASE, "sonoff_zbdonglee", FIRMWARE_ZIGBEE_ROUTER),

        "ROUTER - SparkFun MGM240p": findFirmware(NERIVEC_RELEASE, "sparkfun_mgm240p", FIRMWARE_ZIGBEE_ROUTER),

        // avoid matching on variants with `-`
        "ROUTER - TubeZB MGM24": findFirmware(NERIVEC_RELEASE, "tubeszb-mgm24-", FIRMWARE_ZIGBEE_ROUTER),
        "ROUTER - TubeZB MGM24PB": findFirmware(NERIVEC_RELEASE, "tubeszb-mgm24PB-", FIRMWARE_ZIGBEE_ROUTER),
    },
    nvm3_32768_clear: {
        "Aeotec Zi-Stick (ZGA008)": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F1024IM32", ["nvm3_clear", "32768.gbl"]),

        "EasyIOT ZB-GW04 v1.1": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),
        "EasyIOT ZB-GW04 v1.2": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),

        "Nabu Casa SkyConnect": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F512IM32", ["nvm3_clear", "32768.gbl"]),
        "Nabu Casa Yellow": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM210PA32JIA", ["nvm3_clear", "32768.gbl"]),

        "SMLight SLZB06-M": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),
        "SMLight SLZB06mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", ["nvm3_clear", "32768.gbl"]),
        "SMLight SLZB07": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),
        "SMLight SLZB07mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", ["nvm3_clear", "32768.gbl"]),

        "Sonoff ZBDongle-E": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),

        "SparkFun MGM240p": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNA", ["nvm3_clear", "32768.gbl"]),

        "TubeZB MGM24": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PA32VNN", ["nvm3_clear", "32768.gbl"]),
        "TubeZB MGM24PB": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNN", ["nvm3_clear", "32768.gbl"]),

        "ROUTER - Aeotec Zi-Stick (ZGA008)": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F1024IM32", ["nvm3_clear", "32768.gbl"]),

        "ROUTER - EasyIOT ZB-GW04 v1.1": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),
        "ROUTER - EasyIOT ZB-GW04 v1.2": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),

        "ROUTER - Nabu Casa SkyConnect": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F512IM32", ["nvm3_clear", "32768.gbl"]),
        "ROUTER - Nabu Casa Yellow": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM210PA32JIA", ["nvm3_clear", "32768.gbl"]),

        "ROUTER - SMLight SLZB06-M": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),
        "ROUTER - SMLight SLZB06mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", ["nvm3_clear", "32768.gbl"]),
        "ROUTER - SMLight SLZB07": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),
        "ROUTER - SMLight SLZB07mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", ["nvm3_clear", "32768.gbl"]),

        "ROUTER - Sonoff ZBDongle-E": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "32768.gbl"]),

        "ROUTER - SparkFun MGM240p": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNA", ["nvm3_clear", "32768.gbl"]),

        "ROUTER - TubeZB MGM24": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PA32VNN", ["nvm3_clear", "32768.gbl"]),
        "ROUTER - TubeZB MGM24PB": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNN", ["nvm3_clear", "32768.gbl"]),
    },
    nvm3_40960_clear: {
        "Aeotec Zi-Stick (ZGA008)": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F1024IM32", ["nvm3_clear", "40960.gbl"]),

        "EasyIOT ZB-GW04 v1.1": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),
        "EasyIOT ZB-GW04 v1.2": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),

        "Nabu Casa SkyConnect": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F512IM32", ["nvm3_clear", "40960.gbl"]),
        "Nabu Casa Yellow": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM210PA32JIA", ["nvm3_clear", "40960.gbl"]),

        "SMLight SLZB06-M": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),
        "SMLight SLZB06mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", ["nvm3_clear", "40960.gbl"]),
        "SMLight SLZB07": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),
        "SMLight SLZB07mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", ["nvm3_clear", "40960.gbl"]),

        "Sonoff ZBDongle-E": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),

        "SparkFun MGM240p": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNA", ["nvm3_clear", "40960.gbl"]),

        "TubeZB MGM24": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PA32VNN", ["nvm3_clear", "40960.gbl"]),
        "TubeZB MGM24PB": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNN", ["nvm3_clear", "40960.gbl"]),

        "ROUTER - Aeotec Zi-Stick (ZGA008)": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F1024IM32", ["nvm3_clear", "40960.gbl"]),

        "ROUTER - EasyIOT ZB-GW04 v1.1": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),
        "ROUTER - EasyIOT ZB-GW04 v1.2": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),

        "ROUTER - Nabu Casa SkyConnect": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F512IM32", ["nvm3_clear", "40960.gbl"]),
        "ROUTER - Nabu Casa Yellow": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM210PA32JIA", ["nvm3_clear", "40960.gbl"]),

        "ROUTER - SMLight SLZB06-M": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),
        "ROUTER - SMLight SLZB06mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", ["nvm3_clear", "40960.gbl"]),
        "ROUTER - SMLight SLZB07": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),
        "ROUTER - SMLight SLZB07mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", ["nvm3_clear", "40960.gbl"]),

        "ROUTER - Sonoff ZBDongle-E": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", ["nvm3_clear", "40960.gbl"]),

        "ROUTER - SparkFun MGM240p": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNA", ["nvm3_clear", "40960.gbl"]),

        "ROUTER - TubeZB MGM24": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PA32VNN", ["nvm3_clear", "40960.gbl"]),
        "ROUTER - TubeZB MGM24PB": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNN", ["nvm3_clear", "40960.gbl"]),
    },
    app_clear: {
        "Aeotec Zi-Stick (ZGA008)": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F1024IM32", "app_clear"),

        "EasyIOT ZB-GW04 v1.1": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),
        "EasyIOT ZB-GW04 v1.2": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),

        "Nabu Casa SkyConnect": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F512IM32", "app_clear"),
        "Nabu Casa Yellow": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM210PA32JIA", "app_clear"),

        "SMLight SLZB06-M": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),
        "SMLight SLZB06mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", "app_clear"),
        "SMLight SLZB07": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),
        "SMLight SLZB07mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", "app_clear"),

        "Sonoff ZBDongle-E": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),

        "SparkFun MGM240p": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNA", "app_clear"),

        "TubeZB MGM24": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PA32VNN", "app_clear"),
        "TubeZB MGM24PB": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNN", "app_clear"),

        "ROUTER - Aeotec Zi-Stick (ZGA008)": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F1024IM32", "app_clear"),

        "ROUTER - EasyIOT ZB-GW04 v1.1": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),
        "ROUTER - EasyIOT ZB-GW04 v1.2": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),

        "ROUTER - Nabu Casa SkyConnect": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F512IM32", "app_clear"),
        "ROUTER - Nabu Casa Yellow": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM210PA32JIA", "app_clear"),

        "ROUTER - SMLight SLZB06-M": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),
        "ROUTER - SMLight SLZB06mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", "app_clear"),
        "ROUTER - SMLight SLZB07": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),
        "ROUTER - SMLight SLZB07mg24": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG24A020F1024IM40", "app_clear"),

        "ROUTER - Sonoff ZBDongle-E": findFirmware(NERIVEC_RECOVERY_RELEASE, "EFR32MG21A020F768IM32", "app_clear"),

        "ROUTER - SparkFun MGM240p": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNA", "app_clear"),

        "ROUTER - TubeZB MGM24": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PA32VNN", "app_clear"),
        "ROUTER - TubeZB MGM24PB": findFirmware(NERIVEC_RECOVERY_RELEASE, "MGM240PB32VNN", "app_clear"),
    },
};

writeFileSync("firmware-links.json", JSON.stringify(firmwareLinks, undefined, 4), "utf8");
