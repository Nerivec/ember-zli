import type { checkbox, select } from "@inquirer/prompts";
import type { EmberKeyData, EmberVersion } from "zigbee-herdsman/dist/adapter/ember/types.js";
import type { EUI64 } from "zigbee-herdsman/dist/zspec/tstypes.js";

import type { BAUDRATES } from "./consts.js";
import type { CpcSystemCommandId } from "./enums.js";

// https://github.com/microsoft/TypeScript/issues/24509
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P] extends ReadonlyArray<infer U> ? Mutable<U>[] : Mutable<T[P]>;
};

// types from inquirer/prompts are not exported
export type CheckboxChoices<Value> = Mutable<Parameters<typeof checkbox<Value>>[0]["choices"]>;
export type SelectChoices<Value> = Mutable<Parameters<typeof select<Value>>[0]["choices"]>;

export type AdapterModel =
    | "Aeotec Zi-Stick (ZGA008)"
    | "EasyIOT ZB-GW04 v1.1"
    | "EasyIOT ZB-GW04 v1.2"
    | "Nabu Casa SkyConnect"
    | "Nabu Casa Yellow"
    | "SMLight SLZB06-M"
    | "SMLight SLZB06mg24"
    | "SMLight SLZB07"
    | "SMLight SLZB07mg24"
    | "Sonoff ZBDongle-E"
    | "SparkFun MGM240p"
    | "TubeZB MGM24"
    | "TubeZB MGM24PB"
    | "ROUTER - Aeotec Zi-Stick (ZGA008)"
    | "ROUTER - EasyIOT ZB-GW04 v1.1"
    | "ROUTER - EasyIOT ZB-GW04 v1.2"
    | "ROUTER - Nabu Casa SkyConnect"
    | "ROUTER - Nabu Casa Yellow"
    | "ROUTER - SMLight SLZB06-M"
    | "ROUTER - SMLight SLZB06mg24"
    | "ROUTER - SMLight SLZB07"
    | "ROUTER - SMLight SLZB07mg24"
    | "ROUTER - Sonoff ZBDongle-E"
    | "ROUTER - SparkFun MGM240p"
    | "ROUTER - TubeZB MGM24"
    | "ROUTER - TubeZB MGM24PB";

export type PortType = "serial" | "tcp";
export type BaudRate = (typeof BAUDRATES)[number];

export type PortConf = {
    baudRate: number;
    path: string;
    rtscts: boolean;
    xon: boolean;
    xoff: boolean;
};

export type EmberFullVersion = { ezsp: number; revision: string } & EmberVersion;
export type ConfigValue = { [key: string]: string };

export type FirmwareVariant = "official" | "latest" | "experimental" | "nvm3_32768_clear" | "nvm3_40960_clear" | "app_clear";
export type FirmwareVersion = `${number}.${number}.${number}.${number}`;
export type FirmwareVersionShort = `${number}.${number}.${number}`;
export type FirmwareFilename = `${string}.gbl`;
export type FirmwareURL = `https://${string}/${FirmwareFilename}`;

export type FirmwareFileMetadata = {
    metadata_version: number; // 1
    sdk_version: FirmwareVersionShort; // '5.0.1'
    fw_type: "ncp-uart-hw" | "ncp-uart-sw" | "rcp-uart-802154" | "rcp-uart-802154-blehci";
    baudrate: number; // 115200
    ezsp_version?: FirmwareVersion; // '8.0.1.0'
    ot_version?: FirmwareVersion; // '2.5.1.0'
    ble_version?: FirmwareVersionShort; // '8.1.0'
    cpc_version?: FirmwareVersion; // '5.0.1'
};

export type FirmwareLinks = Record<FirmwareVariant, Partial<Record<AdapterModel, FirmwareURL>>>;

export type TokensInfo = {
    nvm3Key: string; // keyof typeof NVM3ObjectKey
    size: number;
    arraySize: number;
    data: string[];
}[];

/**
 * Use for a link key backup.
 *
 * Each entry notes the EUI64 of the device it is paired to and the key data.
 *   This key may be hashed and not the actual link key currently in use.
 */
export type LinkKeyBackupData = {
    deviceEui64: EUI64;
    key: EmberKeyData;
    outgoingFrameCounter: number;
    incomingFrameCounter: number;
};

export type CpcSystemCommand = {
    /** Identifier of the command. uint8_t */
    commandId: CpcSystemCommandId;
    /** Command sequence number. uint8_t */
    seq: number;
    /** Length of the payload in bytes. uint16_t */
    length: number;
    /** Command payload. uint8_t[PAYLOAD_LENGTH_MAX] */
    payload: Buffer;
};

export type GithubReleaseAssetJson = {
    url: string;
    id: number;
    node_id: string;
    name: string;
    label: null;
    uploader: Record<string, unknown>;
    content_type: string;
    state: string;
    size: number;
    download_count: number;
    created_at: string;
    updated_at: string;
    browser_download_url: string;
};

export type GithubReleaseJson = {
    url: string;
    assets_url: string;
    upload_url: string;
    html_url: string;
    id: number;
    author: Record<string, unknown>;
    node_id: string;
    tag_name: string;
    target_commitish: string;
    name: string;
    draft: false;
    prerelease: false;
    created_at: string;
    published_at: string;
    assets: GithubReleaseAssetJson[];
    tarball_url: string;
    zipball_url: string;
    body: string;
    reactions: Record<string, unknown>;
};
