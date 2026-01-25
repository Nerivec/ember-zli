import { EmberApsOption } from "zigbee-herdsman/dist/adapter/ember/enums.js";
import type { AdapterModel } from "./types.js";

export const PRE_DEFINED_FIRMWARE_LINKS_URL = "https://github.com/Nerivec/ember-zli/raw/refs/heads/main/firmware-links-v3.json";
export const ADAPTER_MODELS: ReadonlyArray<AdapterModel> = [
    "Aeotec Zi-Stick (ZGA008)",
    "EasyIOT ZB-GW04 v1.1",
    "EasyIOT ZB-GW04 v1.2",
    "Inswift ZBM-MG24",
    "Nabu Casa SkyConnect",
    "Nabu Casa Yellow",
    "Nabu Casa ZBT-2",
    "SMLight SLZB06-M",
    "SMLight SLZB06mg24",
    "SMLight SLZB06mg26",
    "SMLight SLZB07",
    "SMLight SLZB07mg24",
    "Sonoff ZBDongle-E",
    "Sonoff Dongle-LMG21",
    "Sonoff Dongle-M",
    "Sonoff Dongle-PMG24",
    "SparkFun MGM240p",
    "TubeZB MGM24",
    "TubeZB BM24",
    "ROUTER - Aeotec Zi-Stick (ZGA008)",
    "ROUTER - EasyIOT ZB-GW04 v1.1",
    "ROUTER - EasyIOT ZB-GW04 v1.2",
    "ROUTER - Inswift ZBM-MG24",
    "ROUTER - Nabu Casa SkyConnect",
    "ROUTER - Nabu Casa Yellow",
    "ROUTER - Nabu Casa ZBT-2",
    "ROUTER - SMLight SLZB06-M",
    "ROUTER - SMLight SLZB06mg24",
    "ROUTER - SMLight SLZB06mg26",
    "ROUTER - SMLight SLZB07",
    "ROUTER - SMLight SLZB07mg24",
    "ROUTER - Sonoff ZBDongle-E",
    "ROUTER - Sonoff Dongle-LMG21",
    "ROUTER - Sonoff Dongle-M",
    "ROUTER - Sonoff Dongle-PMG24",
    "ROUTER - SparkFun MGM240p",
    "ROUTER - TubeZB MGM24",
    "ROUTER - TubeZB BM24",
];
export const TCP_REGEX = /^tcp:\/\/[\w.-]+:\d+$/;
export const BAUDRATES = [115200, 230400, 460800, 921600];
/** Read/write max bytes count at stream level */
export const CONFIG_HIGHWATER_MARK = 256;

/** Default behavior is to disable app key requests */
export const ALLOW_APP_KEY_REQUESTS = false;

export const DEFAULT_APS_OPTIONS = EmberApsOption.RETRY | EmberApsOption.ENABLE_ROUTE_DISCOVERY | EmberApsOption.ENABLE_ADDRESS_DISCOVERY;

export const APPLICATION_ZDO_SEQUENCE_MASK = 0x7f;
export const DEFAULT_ZDO_REQUEST_RADIUS = 0xff;

export const TOUCHLINK_CHANNELS = [11, 15, 20, 25];

export const CPC_PAYLOAD_LENGTH_MAX = 16;
export const CPC_SYSTEM_COMMAND_HEADER_SIZE = 4;

export const CPC_HDLC_FLAG_POS = 0;
export const CPC_HDLC_ADDRESS_POS = 1;
export const CPC_HDLC_LENGTH_POS = 2;
export const CPC_HDLC_CONTROL_POS = 4;
export const CPC_HDLC_HCS_POS = 5;

export const CPC_HDLC_CONTROL_FRAME_TYPE_SHIFT = 6;
export const CPC_HDLC_CONTROL_P_F_SHIFT = 3;
export const CPC_HDLC_CONTROL_SEQ_SHIFT = 4;
export const CPC_HDLC_CONTROL_SUPERVISORY_FNCT_ID_SHIFT = 4;
export const CPC_HDLC_CONTROL_UNNUMBERED_TYPE_SHIFT = 0;

export const CPC_HDLC_CONTROL_UNNUMBERED_TYPE_MASK = 0x37;

export const CPC_HDLC_CONTROL_UNNUMBERED_TYPE_INFORMATION = 0x00;
export const CPC_HDLC_CONTROL_UNNUMBERED_TYPE_POLL_FINAL = 0x04;
export const CPC_HDLC_CONTROL_UNNUMBERED_TYPE_RESET_SEQ = 0x31;
export const CPC_HDLC_CONTROL_UNNUMBERED_TYPE_ACKNOWLEDGE = 0x0e;

export const CPC_HDLC_FLAG_VAL = 0x14;
export const CPC_HDLC_HEADER_SIZE = 5;
export const CPC_HDLC_HEADER_RAW_SIZE = 7;
export const CPC_HDLC_HCS_SIZE = CPC_HDLC_HEADER_RAW_SIZE - CPC_HDLC_HEADER_SIZE;
export const CPC_HDLC_FCS_SIZE = 2;

export const CPC_HDLC_FRAME_TYPE_UNNUMBERED = 3;

export const CPC_DEFAULT_COMMAND_TIMEOUT = 1000;

/** At the next reboot bootloader is executed */
export const CPC_SYSTEM_REBOOT_MODE_BOOTLOADER = 1;

export const CPC_PROPERTY_ID_SECONDARY_CPC_VERSION = 0x03;
export const CPC_PROPERTY_ID_BOOTLOADER_REBOOT_MODE = 0x202;

export const CPC_FLAG_UNNUMBERED_POLL_FINAL = 0x01 << 2;

export const CPC_SERVICE_ENDPOINT_ID_SYSTEM = 0;

export const CREATOR_STACK_RESTORED_EUI64 = 0xe12a;
