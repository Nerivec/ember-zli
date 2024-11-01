import type {
    EmberInitialSecurityState,
    EmberNetworkParameters,
    EmberZigbeeNetwork,
    SecManContext,
} from 'zigbee-herdsman/dist/adapter/ember/types.js'
import type { PanId } from 'zigbee-herdsman/dist/zspec/tstypes.js'

import type { ConfigValue, LinkKeyBackupData } from '../../utils/types.js'

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

import { checkbox, confirm, input, select } from '@inquirer/prompts'
import { Command } from '@oclif/core'
import { Presets, SingleBar } from 'cli-progress'

import { ZSpec } from 'zigbee-herdsman'
import { EmberTokensManager } from 'zigbee-herdsman/dist/adapter/ember/adapter/tokensManager.js'
import {
    EmberExtendedSecurityBitmask,
    EmberInitialSecurityBitmask,
    EmberJoinMethod,
    EmberLibraryId,
    EmberNodeType,
    EzspNetworkScanType,
    SecManKeyType,
    SLStatus,
} from 'zigbee-herdsman/dist/adapter/ember/enums.js'
import { EMBER_AES_HASH_BLOCK_SIZE, EMBER_ENCRYPTION_KEY_SIZE } from 'zigbee-herdsman/dist/adapter/ember/ezsp/consts.js'
import { EzspConfigId, EzspDecisionBitmask, EzspDecisionId, EzspMfgTokenId, EzspPolicyId } from 'zigbee-herdsman/dist/adapter/ember/ezsp/enums.js'
import { Ezsp } from 'zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js'
import { initSecurityManagerContext } from 'zigbee-herdsman/dist/adapter/ember/utils/initters.js'
import { toUnifiedBackup } from 'zigbee-herdsman/dist/utils/backup.js'

import {
    DEFAULT_CONFIGURATION_YAML_PATH,
    DEFAULT_NETWORK_BACKUP_PATH,
    DEFAULT_STACK_CONFIG_PATH,
    DEFAULT_TOKENS_BACKUP_PATH,
    logger,
} from '../../index.js'
import { CREATOR_STACK_RESTORED_EUI64, TOUCHLINK_CHANNELS } from '../../utils/consts.js'
import {
    emberFullVersion,
    emberNetworkInit,
    emberStart,
    emberStop,
    getKeyStructBitmask,
    getLibraryStatus,
    waitForStackStatus,
} from '../../utils/ember.js'
import { NVM3ObjectKey } from '../../utils/enums.js'
import { getPortConf } from '../../utils/port.js'
import { browseToFile, getBackupFromFile, toHex } from '../../utils/utils.js'

const enum StackMenu {
    STACK_INFO = 0,
    STACK_CONFIG = 1,

    NETWORK_INFO = 10,
    NETWORK_SCAN = 11,
    NETWORK_BACKUP = 12,
    NETWORK_RESTORE = 13,
    NETWORK_LEAVE = 14,

    TOKENS_BACKUP = 20,
    TOKENS_RESTORE = 21,
    TOKENS_RESET = 22,
    TOKENS_WRITE_EUI64 = 23,

    SECURITY_INFO = 30,

    ZIGBEE2MQTT_ONBOARD = 40,

    REPAIRS = 99,
}

const BULLET_FULL = '\u2022'
const BULLET_EMPTY = '\u2219'

export default class Stack extends Command {
    static override args = {}
    static override description = 'Interact with the EmberZNet stack in the adapter.'
    static override examples = ['<%= config.bin %> <%= command.id %>']
    static override flags = {}

    public async run(): Promise<void> {
        // const {flags} = await this.parse(Stack)
        const portConf = await getPortConf()
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`)

        let ezsp = await emberStart(portConf)
        let exit: boolean = false

        while (!exit) {
            exit = await this.navigateMenu(ezsp)

            if (exit) {
                const restart = await confirm({
                    default: true,
                    message: 'Restart? (If no, exit)',
                })

                if (restart) {
                    await emberStop(ezsp)
                    ezsp = await emberStart(portConf)
                    exit = false
                }
            }
        }

        await emberStop(ezsp)

        return this.exit(0)
    }

    private async menuNetworkBackup(ezsp: Ezsp): Promise<boolean> {
        const saveFile = await browseToFile('Network backup save file', DEFAULT_NETWORK_BACKUP_PATH, true)
        const initStatus = await emberNetworkInit(ezsp)

        if (initStatus === SLStatus.NOT_JOINED) {
            logger.error(`No network present.`)
            return true
        }

        if (initStatus !== SLStatus.OK) {
            logger.error(`Failed network init request with status=${SLStatus[initStatus]}.`)
            return true
        }

        await waitForStackStatus(ezsp, SLStatus.NETWORK_UP)

        const [netStatus, , netParams] = await ezsp.ezspGetNetworkParameters()

        if (netStatus !== SLStatus.OK) {
            logger.error(`Failed to get network parameters with status=${SLStatus[netStatus]}.`)
            return true
        }

        const eui64 = await ezsp.ezspGetEui64()
        const [netKeyStatus, netKeyInfo] = await ezsp.ezspGetNetworkKeyInfo()

        if (netKeyStatus !== SLStatus.OK) {
            logger.error(`Failed to get network keys info with status=${SLStatus[netKeyStatus]}.`)
            return true
        }

        if (!netKeyInfo.networkKeySet) {
            logger.error(`No network key set.`)
            return true
        }

        const [confStatus, keyTableSize] = await ezsp.ezspGetConfigurationValue(EzspConfigId.KEY_TABLE_SIZE)

        if (confStatus !== SLStatus.OK) {
            logger.error(`Failed to retrieve key table size from NCP with status=${SLStatus[confStatus]}.`)
            return true
        }

        const keyList: LinkKeyBackupData[] = []

        for (let i = 0; i < keyTableSize; i++) {
            const [status, context, plaintextKey, apsKeyMeta] = await ezsp.ezspExportLinkKeyByIndex(i)
            logger.debug(`Export link key at index ${i}, status=${SLStatus[status]}.`)

            // only include key if we could retrieve one at index and hash it properly
            if (status === SLStatus.OK) {
                // Rather than give the real link key, the backup contains a hashed version of the key.
                // This is done to prevent a compromise of the backup data from compromising the current link keys.
                // This is per the Smart Energy spec.
                const [hashStatus, returnContext] = await ezsp.ezspAesMmoHash(
                    { result: Buffer.alloc(EMBER_AES_HASH_BLOCK_SIZE), length: 0x00000000 },
                    true,
                    plaintextKey.contents,
                )

                if (hashStatus === SLStatus.OK) {
                    keyList.push({
                        deviceEui64: context.eui64,
                        key: { contents: returnContext.result },
                        outgoingFrameCounter: apsKeyMeta.outgoingFrameCounter,
                        incomingFrameCounter: apsKeyMeta.incomingFrameCounter,
                    })
                } else {
                    // this should never happen?
                    logger.error(`Failed to hash link key at index ${i} with status=${SLStatus[hashStatus]}. Omitting from backup.`)
                }
            }
        }

        logger.info(`Retrieved ${keyList.length} link keys.`)

        let context: SecManContext = initSecurityManagerContext()
        context.coreKeyType = SecManKeyType.TC_LINK
        const [tclkStatus, tcLinkKey] = await ezsp.ezspExportKey(context)

        if (tclkStatus !== SLStatus.OK) {
            logger.error(`Failed to export TC Link Key with status=${SLStatus[tclkStatus]}.`)
            return true
        }

        context = initSecurityManagerContext() // make sure it's back to zeroes
        context.coreKeyType = SecManKeyType.NETWORK
        context.keyIndex = 0
        const [nkStatus, networkKey] = await ezsp.ezspExportKey(context)

        if (nkStatus !== SLStatus.OK) {
            logger.error(`Failed to export Network Key with status=${SLStatus[nkStatus]}.`)
            return true
        }

        const backup = {
            coordinatorIeeeAddress: Buffer.from(eui64.slice(2) /* take out 0x */, 'hex').reverse(),
            devices: keyList.map((key) => ({
                networkAddress: ZSpec.NULL_NODE_ID, // not used for restore, no reason to make NCP calls for nothing
                ieeeAddress: Buffer.from(key.deviceEui64.slice(2) /* take out 0x */, 'hex').reverse(),
                isDirectChild: false, // not used
                linkKey: {
                    key: key.key.contents,
                    rxCounter: key.incomingFrameCounter,
                    txCounter: key.outgoingFrameCounter,
                },
            })),
            ezsp: {
                hashed_tclk: tcLinkKey.contents,
                version: emberFullVersion.ezsp,
                // altNetworkKey: altNetworkKey.contents,
            },
            logicalChannel: netParams.radioChannel,
            networkKeyInfo: {
                frameCounter: netKeyInfo.networkKeyFrameCounter,
                sequenceNumber: netKeyInfo.networkKeySequenceNumber,
            },
            networkOptions: {
                channelList: ZSpec.Utils.uint32MaskToChannels(netParams.channels),
                extendedPanId: Buffer.from(netParams.extendedPanId),
                networkKey: networkKey.contents,
                networkKeyDistribute: false,
                panId: netParams.panId, // uint16_t
            },
            networkUpdateId: netParams.nwkUpdateId,
            securityLevel: 5, // Z3.0
        }
        const unifiedBackup = await toUnifiedBackup(backup)

        writeFileSync(saveFile, JSON.stringify(unifiedBackup, null, 2), 'utf8')

        logger.info(`Network backup written to '${saveFile}'.`)

        return true
    }

    private async menuNetworkInfo(ezsp: Ezsp): Promise<boolean> {
        const initStatus = await emberNetworkInit(ezsp)

        if (initStatus === SLStatus.NOT_JOINED) {
            logger.error(`No network present.`)
            return true
        }

        if (initStatus !== SLStatus.OK) {
            logger.error(`Failed network init request with status=${SLStatus[initStatus]}.`)
            return true
        }

        await waitForStackStatus(ezsp, SLStatus.NETWORK_UP)

        const [npStatus, nodeType, netParams] = await ezsp.ezspGetNetworkParameters()

        if (npStatus !== SLStatus.OK) {
            logger.error(`Failed to get network parameters with status=${SLStatus[npStatus]}.`)
            return true
        }

        const eui64 = await ezsp.ezspGetEui64()

        const [netKeyStatus, netKeyInfo] = await ezsp.ezspGetNetworkKeyInfo()

        if (netKeyStatus !== SLStatus.OK) {
            throw new Error(`[BACKUP] Failed to get network keys info with status=${SLStatus[netKeyStatus]}.`)
        }

        const context = initSecurityManagerContext()
        context.coreKeyType = SecManKeyType.TC_LINK

        const [tcKeyStatus, tcKeyInfo] = await ezsp.ezspGetApsKeyInfo(context)

        if (tcKeyStatus !== SLStatus.OK) {
            throw new Error(`[BACKUP] Failed to get TC APS key info with status=${SLStatus[tcKeyStatus]}.`)
        }

        logger.info(`Node EUI64=${eui64} type=${EmberNodeType[nodeType]}.`)
        logger.info(`Network parameters:`)
        logger.info(`  - PAN ID: ${netParams.panId} (${toHex(netParams.panId)})`)
        logger.info(`  - Extended PAN ID: ${netParams.extendedPanId}`)
        logger.info(`  - Radio Channel: ${netParams.radioChannel}`)
        logger.info(`  - Radio Power: ${netParams.radioTxPower} dBm`)
        logger.info(`  - Preferred Channels: ${ZSpec.Utils.uint32MaskToChannels(netParams.channels).join(',')}`)
        logger.info(`Network key info:`)
        logger.info(`  - Set? ${netKeyInfo.networkKeySet ? 'yes' : 'no'}`)
        logger.info(`  - Sequence Number: ${netKeyInfo.networkKeySequenceNumber}`)
        logger.info(`  - Frame Counter: ${netKeyInfo.networkKeyFrameCounter}`)
        logger.info(`  - Alt Set? ${netKeyInfo.alternateNetworkKeySet ? 'yes' : 'no'}`)
        logger.info(`  - Alt Sequence Number: ${netKeyInfo.altNetworkKeySequenceNumber}`)
        logger.info(`Trust Center link key info:`)
        logger.info(`  - Properties: ${getKeyStructBitmask(tcKeyInfo.bitmask)}`)
        logger.info(`  - Incoming Frame Counter: ${tcKeyInfo.incomingFrameCounter}`)
        logger.info(`  - Outgoing Frame Counter: ${tcKeyInfo.outgoingFrameCounter}`)

        return true
    }

    private async menuNetworkLeave(ezsp: Ezsp): Promise<boolean> {
        const confirmed = await confirm({
            default: false,
            message: 'Confirm leave network? (Cannot be undone without a backup.)',
        })

        if (!confirmed) {
            logger.info(`Network leave cancelled.`)
            return false
        }

        const initStatus = await emberNetworkInit(ezsp)

        if (initStatus === SLStatus.NOT_JOINED) {
            logger.info(`No network present.`)
            return true
        }

        if (initStatus !== SLStatus.OK) {
            logger.error(`Failed network init request with status=${SLStatus[initStatus]}.`)
            return true
        }

        await waitForStackStatus(ezsp, SLStatus.NETWORK_UP)

        const leaveStatus = await ezsp.ezspLeaveNetwork()

        if (leaveStatus !== SLStatus.OK) {
            logger.error(`Failed to leave network with status=${SLStatus[leaveStatus]}.`)
            return true
        }

        await waitForStackStatus(ezsp, SLStatus.NETWORK_DOWN)

        logger.info(`Left network.`)

        return true
    }

    private async menuNetworkRestore(ezsp: Ezsp): Promise<boolean> {
        const backupFile = await browseToFile('Network backup file location', DEFAULT_NETWORK_BACKUP_PATH)
        const backup = getBackupFromFile(backupFile)

        if (backup === undefined) {
            // error logged in getBackupFromFile
            return false
        }

        if (!backup.ezsp) {
            const confirmed = await confirm({ message: `Backup file is not for EmberZNet stack. Restore anyway?`, default: false })

            if (!confirmed) {
                logger.info(`Restore cancelled.`)
                return false
            }
        }

        if (!backup.ezsp?.hashed_tclk) {
            logger.debug(`Backup file does not contain the Trust Center Link Key. Generating random one.`)
            // don't care about version here, so just overwrite the whole `ezsp` object
            backup.ezsp = { hashed_tclk: randomBytes(EMBER_ENCRYPTION_KEY_SIZE) }
        }

        const radioTxPower = Number.parseInt(
            await input({
                default: '5',
                message: 'Radio transmit power [-128-127]',
                validate(value) {
                    if (/\./.test(value)) {
                        return false
                    }

                    const v = Number.parseInt(value, 10)

                    return v >= -128 && v <= 127
                },
            }),
            10,
        )
        let status = await emberNetworkInit(ezsp)
        const noNetwork = status === SLStatus.NOT_JOINED

        if (!noNetwork && status !== SLStatus.OK) {
            logger.error(`Failed network init request with status=${SLStatus[status]}.`)
            return true
        }

        if (!noNetwork) {
            const overwrite = await confirm({
                default: false,
                message: 'A network is present in the adapter. Leave and continue restoring?',
            })

            if (!overwrite) {
                logger.info(`Restore cancelled.`)
                return true
            }

            status = await ezsp.ezspLeaveNetwork()

            if (status !== SLStatus.OK) {
                logger.error(`Failed to leave network with status=${SLStatus[status]}.`)
                return true
            }

            await waitForStackStatus(ezsp, SLStatus.NETWORK_DOWN)
        }

        // before forming

        const keyList: LinkKeyBackupData[] = backup.devices.map((device) => {
            const octets = [...device.ieeeAddress.reverse()]

            return {
                deviceEui64: `0x${octets.map((octet) => octet.toString(16).padStart(2, '0')).join('')}`,
                // won't export if linkKey not present, so should always be valid here
                key: { contents: device.linkKey!.key },
                outgoingFrameCounter: device.linkKey!.txCounter,
                incomingFrameCounter: device.linkKey!.rxCounter,
            }
        })

        if (keyList.length > 0) {
            const [confStatus, keyTableSize] = await ezsp.ezspGetConfigurationValue(EzspConfigId.KEY_TABLE_SIZE)

            if (confStatus !== SLStatus.OK) {
                logger.error(`Failed to retrieve key table size from NCP with status=${SLStatus[confStatus]}.`)
                return true
            }

            if (keyList.length > keyTableSize) {
                logger.error(`Current key table of ${keyTableSize} is too small to import backup of ${keyList.length}!`)
                return true
            }

            let status: SLStatus

            for (let i = 0; i < keyTableSize; i++) {
                // erase any key index not present in backup but available on the NCP
                status =
                    i >= keyList.length
                        ? await ezsp.ezspEraseKeyTableEntry(i)
                        : await ezsp.ezspImportLinkKey(i, keyList[i].deviceEui64, keyList[i].key)

                if (status !== SLStatus.OK) {
                    logger.error(`Failed to ${i >= keyList.length ? 'erase' : 'set'} key table entry at index ${i} with status=${SLStatus[status]}`)
                }
            }

            logger.info(`Imported ${keyList.length} keys.`)
        }

        // status = await ezsp.ezspSetNWKFrameCounter(backup.networkKeyInfo.frameCounter)

        // if (status !== SLStatus.OK) {
        //     logger.error(`Failed to set NWK frame counter to ${backup.networkKeyInfo.frameCounter} with status=${SLStatus[status]}.`)
        //     return true
        // }

        // status = await ezsp.ezspSetAPSFrameCounter(backup.tcLinkKeyInfo.outgoingFrameCounter)

        // if (status !== SLStatus.OK) {
        //     logger.error(`Failed to set TC APS frame counter to ${backup.tcLinkKeyInfo.outgoingFrameCounter} with status=${SLStatus[status]}.`)
        //     return true
        // }

        const state: EmberInitialSecurityState = {
            bitmask:
                EmberInitialSecurityBitmask.TRUST_CENTER_GLOBAL_LINK_KEY |
                EmberInitialSecurityBitmask.HAVE_PRECONFIGURED_KEY |
                EmberInitialSecurityBitmask.HAVE_NETWORK_KEY |
                EmberInitialSecurityBitmask.TRUST_CENTER_USES_HASHED_LINK_KEY |
                EmberInitialSecurityBitmask.REQUIRE_ENCRYPTED_KEY |
                EmberInitialSecurityBitmask.NO_FRAME_COUNTER_RESET,
            networkKey: { contents: backup.networkOptions.networkKey },
            networkKeySequenceNumber: backup.networkKeyInfo.sequenceNumber,
            preconfiguredKey: { contents: backup.ezsp!.hashed_tclk! }, // presence validated above
            preconfiguredTrustCenterEui64: ZSpec.BLANK_EUI64,
        }

        status = await ezsp.ezspSetInitialSecurityState(state)

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set initial security state with status=${SLStatus[status]}.`)
            return true
        }

        const extended: EmberExtendedSecurityBitmask =
            EmberExtendedSecurityBitmask.JOINER_GLOBAL_LINK_KEY | EmberExtendedSecurityBitmask.NWK_LEAVE_REQUEST_NOT_ALLOWED
        status = await ezsp.ezspSetExtendedSecurityBitmask(extended)

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set extended security bitmask to ${extended} with status=${SLStatus[status]}.`)
            return true
        }

        const netParams: EmberNetworkParameters = {
            channels: ZSpec.ALL_802_15_4_CHANNELS_MASK,
            extendedPanId: [...backup.networkOptions.extendedPanId],
            joinMethod: EmberJoinMethod.MAC_ASSOCIATION,
            nwkManagerId: ZSpec.COORDINATOR_ADDRESS,
            nwkUpdateId: 0,
            panId: backup.networkOptions.panId,
            radioChannel: backup.logicalChannel,
            radioTxPower,
        }

        logger.info(`Forming new network with: ${JSON.stringify(netParams)}`)

        status = await ezsp.ezspFormNetwork(netParams)

        if (status !== SLStatus.OK) {
            logger.error(`Failed form network request with status=${SLStatus[status]}.`)
            return true
        }

        await waitForStackStatus(ezsp, SLStatus.NETWORK_UP)

        const stStatus = await ezsp.ezspStartWritingStackTokens()

        logger.debug(`Start writing stack tokens status=${SLStatus[stStatus]}.`)
        logger.info(`New network formed!`)

        const [netStatus, , parameters] = await ezsp.ezspGetNetworkParameters()

        if (netStatus !== SLStatus.OK) {
            logger.error(`Failed to get network parameters with status=${SLStatus[netStatus]}.`)
            return true
        }

        if (
            parameters.panId === backup.networkOptions.panId &&
            Buffer.from(parameters.extendedPanId).equals(backup.networkOptions.extendedPanId) &&
            parameters.radioChannel === backup.logicalChannel
        ) {
            logger.info(`Restored network backup.`)
        } else {
            logger.error(`Failed to restore network backup.`)
        }

        return true // cleaner to exit after this
    }

    private async menuNetworkScan(ezsp: Ezsp): Promise<boolean> {
        const radioTxPower = Number.parseInt(
            await input({
                default: '5',
                message: 'Radio transmit power [-128-127]',
                validate(value) {
                    if (/\./.test(value)) {
                        return false
                    }

                    const v = Number.parseInt(value, 10)

                    return v >= -128 && v <= 127
                },
            }),
            10,
        )

        const status = await ezsp.ezspSetRadioPower(radioTxPower)

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set transmit power to ${radioTxPower} status=${SLStatus[status]}.`)
            return true
        }

        const scanType = await select<EzspNetworkScanType>({
            choices: [
                { name: 'Scan each channel for its RSSI value', value: EzspNetworkScanType.ENERGY_SCAN },
                { name: 'Scan each channel for existing networks', value: EzspNetworkScanType.ACTIVE_SCAN },
            ],
            message: 'Type of scan',
        })

        // WiFi beacon frames at standard interval: 102.4msec
        const duration = await select<number>({
            choices: [
                { name: '3948 msec', value: 8 },
                { name: '1981 msec', value: 7 },
                { name: '998 msec', value: 6 },
                { name: '507 msec', value: 5 },
                { name: '261 msec', value: 4 },
                { name: '138 msec', value: 3 },
                { name: '77 msec', value: 2 },
                { name: '46 msec', value: 1 },
                { name: '31 msec', value: 0 },
            ],
            default: 6,
            message: 'Duration of scan per channel',
        })
        const progressBar = new SingleBar({ clearOnComplete: true, format: '{bar} {percentage}% | ETA: {eta}s' }, Presets.shades_classic)
        // a symbol is 16 microseconds, a scan period is 960 symbols
        const totalTime = (((2 ** duration + 1) * (16 * 960)) / 1000) * ZSpec.ALL_802_15_4_CHANNELS.length
        let scanCompleted: (value: PromiseLike<void> | void) => void
        const reportedValues: string[] = []
        // NOTE: expanding zigbee-herdsman
        const ezspEnergyScanResultHandlerOriginal = ezsp.ezspEnergyScanResultHandler
        const ezspNetworkFoundHandlerOriginal = ezsp.ezspNetworkFoundHandler
        const ezspScanCompleteHandlerOriginal = ezsp.ezspScanCompleteHandler

        ezsp.ezspEnergyScanResultHandler = (channel: number, maxRssiValue: number): void => {
            logger.debug(`ezspEnergyScanResultHandler: ${JSON.stringify({ channel, maxRssiValue })}`)
            const full = 90 + maxRssiValue
            const empty = 90 - full

            if (full < 1 || empty < 1) {
                reportedValues.push(`Channel ${channel}: ERROR`)
            } else {
                reportedValues.push(`Channel ${channel}: ${BULLET_FULL.repeat(full)}${BULLET_EMPTY.repeat(empty)} [${maxRssiValue} dBm]`)
            }
        }

        ezsp.ezspNetworkFoundHandler = (networkFound: EmberZigbeeNetwork, lastHopLqi: number, lastHopRssi: number): void => {
            logger.debug(`ezspNetworkFoundHandler: ${JSON.stringify({ networkFound, lastHopLqi, lastHopRssi })}`)
            reportedValues.push(
                `Found network:`,
                `  - PAN ID: ${networkFound.panId}`,
                `  - Ext PAN ID: ${networkFound.extendedPanId}`,
                `  - Channel: ${networkFound.channel}`,
                `  - Allowing join: ${networkFound.allowingJoin ? 'yes' : 'no'}`,
                `  - Node RSSI: ${lastHopRssi} dBm | LQI: ${lastHopLqi}`,
            )
        }

        ezsp.ezspScanCompleteHandler = (channel: number, status: SLStatus): void => {
            logger.debug(`ezspScanCompleteHandler: ${JSON.stringify({ channel, status })}`)
            progressBar.stop()
            clearInterval(progressInterval)

            if (status === SLStatus.OK) {
                if (scanCompleted) {
                    scanCompleted()
                }
            } else {
                logger.error(`Failed to scan ${channel} with status=${SLStatus[status]}.`)
            }
        }

        const startScanStatus = await ezsp.ezspStartScan(scanType, ZSpec.ALL_802_15_4_CHANNELS_MASK, duration)

        if (startScanStatus !== SLStatus.OK) {
            logger.error(`Failed start scan request with status=${SLStatus[startScanStatus]}.`)
            // restore zigbee-herdsman default
            ezsp.ezspEnergyScanResultHandler = ezspEnergyScanResultHandlerOriginal
            ezsp.ezspNetworkFoundHandler = ezspNetworkFoundHandlerOriginal
            ezsp.ezspScanCompleteHandler = ezspScanCompleteHandlerOriginal
            return true
        }

        progressBar.start(totalTime, 0)

        const progressInterval = setInterval(() => {
            progressBar.increment(500)
        }, 500)

        await new Promise<void>((resolve) => {
            scanCompleted = resolve
        })

        for (const line of reportedValues) {
            logger.info(line)
        }

        // restore zigbee-herdsman default
        ezsp.ezspEnergyScanResultHandler = ezspEnergyScanResultHandlerOriginal
        ezsp.ezspNetworkFoundHandler = ezspNetworkFoundHandlerOriginal
        ezsp.ezspScanCompleteHandler = ezspScanCompleteHandlerOriginal
        return false
    }

    private async menuRepairs(ezsp: Ezsp): Promise<boolean> {
        const enum RepairId {
            EUI64_MISMATCH = 0,
        }
        const repairId = await select<-1 | RepairId>({
            choices: [
                { name: 'Check for EUI64 mismatch', value: RepairId.EUI64_MISMATCH },
                { name: 'Go Back', value: -1 },
            ],
            message: 'Repair',
        })

        switch (repairId) {
            case RepairId.EUI64_MISMATCH: {
                const initStatus = await emberNetworkInit(ezsp)

                if (initStatus === SLStatus.NOT_JOINED) {
                    logger.info(`No network present.`)
                    return true
                }

                if (initStatus !== SLStatus.OK) {
                    logger.error(`Failed network init request with status=${SLStatus[initStatus]}.`)
                    return true
                }

                const [status, securityState] = await ezsp.ezspGetCurrentSecurityState()

                if (status !== SLStatus.OK) {
                    logger.error(`Failed get current security state request with status=${SLStatus[status]}.`)
                    return true
                }

                const eui64 = await ezsp.ezspGetEui64()

                logger.info(`Node EUI64 ${eui64} / Trust Center EUI64 ${securityState.trustCenterLongAddress}.`)

                if (securityState.trustCenterLongAddress === eui64) {
                    logger.info(`EUI64 match. No fix required.`)
                    return true
                }

                logger.warning(`Fixing EUI64 mismatch...`)

                const [gtkStatus, tokenData] = await ezsp.ezspGetTokenData(NVM3ObjectKey.STACK_TRUST_CENTER, 0)

                if (gtkStatus !== SLStatus.OK) {
                    logger.error(`Failed get token data request with status=${SLStatus[gtkStatus]}.`)
                    return true
                }

                const tokenEUI64 = tokenData.data.subarray(2, 10)
                const tcEUI64 = Buffer.from(securityState.trustCenterLongAddress.slice(2 /* 0x */), 'hex').reverse()

                if (tokenEUI64.equals(tcEUI64)) {
                    tokenData.data.set(Buffer.from(eui64.slice(2 /* 0x */), 'hex').reverse(), 2 /* skip uint16_t at start */)

                    const stkStatus = await ezsp.ezspSetTokenData(NVM3ObjectKey.STACK_TRUST_CENTER, 0, tokenData)

                    if (stkStatus !== SLStatus.OK) {
                        logger.error(`Failed set token data request with status=${SLStatus[stkStatus]}.`)
                        return true
                    }
                } else {
                    logger.error(`Failed to fix EUI64 mismatch. NVM3 Trust Center token doesn't match current security state.`)
                    return true
                }

                break
            }

            case -1: {
                return false
            }
        }

        return true
    }

    private async menuSecurityInfo(ezsp: Ezsp): Promise<boolean> {
        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.TC_LINK
            const [status, key] = await ezsp.ezspExportKey(context)

            if (status === SLStatus.OK) {
                logger.info(`Trust Center Link Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export Trust Center Link Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.APP_LINK
            const [status, key] = await ezsp.ezspExportKey(context)

            if (status === SLStatus.OK) {
                logger.info(`App Link Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export App Link Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.NETWORK
            context.keyIndex = 0
            const [status, key] = await ezsp.ezspExportKey(context)

            if (status === SLStatus.OK) {
                logger.info(`Network Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export Network Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.ZLL_ENCRYPTION_KEY
            const [status, key] = await ezsp.ezspExportKey(context)

            if (status === SLStatus.OK) {
                logger.info(`ZLL Encryption Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export ZLL Encryption Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.ZLL_PRECONFIGURED_KEY
            const [status, key] = await ezsp.ezspExportKey(context)

            if (status === SLStatus.OK) {
                logger.info(`ZLL Preconfigured Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export ZLL Preconfigured Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.GREEN_POWER_PROXY_TABLE_KEY
            const [status, key] = await ezsp.ezspExportKey(context)

            if (status === SLStatus.OK) {
                logger.info(`Green Power Proxy Table Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export Green Power Proxy Table Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.GREEN_POWER_SINK_TABLE_KEY
            const [status, key] = await ezsp.ezspExportKey(context)

            if (status === SLStatus.OK) {
                logger.info(`Green Power Sink Table Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export Green Power Sink Table Key with status=${SLStatus[status]}.`)
            }
        }

        return false
    }

    private async menuStackConfig(ezsp: Ezsp): Promise<boolean> {
        let saveFile: string | undefined = undefined

        if (await confirm({ default: false, message: 'Save to file? (Only print if not)' })) {
            saveFile = await browseToFile('Config save location (JSON)', DEFAULT_STACK_CONFIG_PATH, true)
        }

        const stackConfig: ConfigValue = {}

        for (const key of Object.keys(EzspConfigId)) {
            const configId = EzspConfigId[key as keyof typeof EzspConfigId]

            if (typeof configId !== 'number') {
                continue
            }

            const [status, value] = await ezsp.ezspGetConfigurationValue(configId)

            stackConfig[`CONFIG.${key}`] = status === SLStatus.OK ? `${value}` : SLStatus[status]
        }

        {
            // needs special handling due to bitmask, excluded from below for-loop
            const [status, value] = await ezsp.ezspGetPolicy(EzspPolicyId.TRUST_CENTER_POLICY)
            const tcDecisions = []

            for (const key of Object.keys(EzspDecisionBitmask)) {
                const bitmask = EzspDecisionBitmask[key as keyof typeof EzspDecisionBitmask]

                if (typeof bitmask !== 'number') {
                    continue
                }

                if ((value & bitmask) !== 0) {
                    tcDecisions.push(key)
                }
            }

            stackConfig[`POLICY.TRUST_CENTER_POLICY`] = status === SLStatus.OK ? tcDecisions.join(',') : SLStatus[status]
        }

        for (const key of Object.keys(EzspPolicyId)) {
            const policyId = EzspPolicyId[key as keyof typeof EzspPolicyId]

            if (typeof policyId !== 'number' || policyId === EzspPolicyId.TRUST_CENTER_POLICY) {
                continue
            }

            const [status, value] = await ezsp.ezspGetPolicy(policyId)

            stackConfig[`POLICY.${key}`] = status === SLStatus.OK ? EzspDecisionId[value] : SLStatus[status]
        }

        {
            // needs special handling due to zero-conflict with `FIRST`, excluded from below for-loop
            const status = await ezsp.ezspGetLibraryStatus(EmberLibraryId.ZIGBEE_PRO)
            stackConfig[`LIBRARY.ZIGBEE_PRO`] = getLibraryStatus(EmberLibraryId.ZIGBEE_PRO, status)
        }

        for (let i = EmberLibraryId.FIRST + 1; i < EmberLibraryId.NUMBER_OF_LIBRARIES; i++) {
            const status = await ezsp.ezspGetLibraryStatus(i)
            stackConfig[`LIBRARY.${EmberLibraryId[i]}`] = getLibraryStatus(i, status)
        }

        for (const key of Object.keys(EzspMfgTokenId)) {
            const tokenId = EzspMfgTokenId[key as keyof typeof EzspMfgTokenId]

            if (typeof tokenId !== 'number') {
                continue
            }

            const [, tokenData] = await ezsp.ezspGetMfgToken(tokenId)

            stackConfig[`MFG_TOKEN.${key}`] = `${tokenData.join(',')}`
        }

        for (const key of Object.keys(stackConfig)) {
            logger.info(`${key} = ${stackConfig[key]}.`)
        }

        if (saveFile !== undefined) {
            writeFileSync(saveFile, JSON.stringify(stackConfig, null, 2), 'utf8')
            logger.info(`Stack config written to '${saveFile}'.`)
        }

        return false
    }

    private async menuStackInfo(): Promise<boolean> {
        logger.info(`EmberZNet: ${emberFullVersion.revision}. EZSP: ${emberFullVersion.ezsp}`)
        return false
    }

    private async menuTokensBackup(ezsp: Ezsp): Promise<boolean> {
        const saveFile = await browseToFile('Tokens backup save file', DEFAULT_TOKENS_BACKUP_PATH, true)
        const eui64 = await ezsp.ezspGetEui64()
        const tokensBuf = await EmberTokensManager.saveTokens(ezsp, Buffer.from(eui64.slice(2 /* 0x */), 'hex').reverse())

        if (tokensBuf) {
            writeFileSync(saveFile, tokensBuf.toString('hex'), 'utf8')

            logger.info(`Tokens backup written to '${saveFile}'.`)
        } else {
            logger.error(`Failed to backup tokens.`)
        }

        return false
    }

    private async menuTokensReset(ezsp: Ezsp): Promise<boolean> {
        const confirmed = await confirm({
            default: false,
            message: 'Confirm tokens reset? (Cannot be undone without a backup.)',
        })

        if (!confirmed) {
            logger.info(`Tokens reset cancelled.`)
            return false
        }

        const options = await checkbox<string>({
            choices: [
                { checked: false, name: 'Exclude network and APS outgoing frame counter tokens?', value: 'excludeOutgoingFC' },
                { checked: false, name: 'Exclude stack boot counter token?', value: 'excludeBootCounter' },
            ],
            message: 'Reset options',
        })

        await ezsp.ezspTokenFactoryReset(options.includes('excludeOutgoingFC'), options.includes('excludeBootCounter'))

        return true
    }

    private async menuTokensRestore(ezsp: Ezsp): Promise<boolean> {
        const backupFile = await browseToFile('Tokens backup file location', DEFAULT_TOKENS_BACKUP_PATH)
        const tokensBuf = Buffer.from(readFileSync(backupFile, 'utf8'), 'hex')
        const status = await EmberTokensManager.restoreTokens(ezsp, tokensBuf)

        if (status === SLStatus.OK) {
            logger.info(`Restored tokens.`)
        } else {
            logger.error(`Failed to restore tokens.`)
        }

        return true
    }

    private async menuTokensWriteEUI64(ezsp: Ezsp): Promise<boolean> {
        let tokenKey: number | undefined

        for (const key of [NVM3ObjectKey.STACK_RESTORED_EUI64, CREATOR_STACK_RESTORED_EUI64]) {
            const [status, tokenData] = await ezsp.ezspGetTokenData(key, 0)

            if (status === SLStatus.OK) {
                logger.debug(`Restored EUI64 token (${key}): ${tokenData.data.toString('hex')}.`)

                tokenKey = key
                break
            }
        }

        if (tokenKey === undefined) {
            logger.error(`Unable to write EUI64, operation not supported by firmware.`)

            return false
        }

        const enum Source {
            FILE = 0,
            INPUT = 1,
        }
        const source = await select<-1 | Source>({
            choices: [
                { name: 'From coordinator backup file', value: Source.FILE },
                { name: `From manual input (format: ${ZSpec.BLANK_EUI64})`, value: Source.INPUT },
                { name: 'Go Back', value: -1 },
            ],
            message: 'Source for the EUI64',
        })
        let eui64Hex: string | undefined
        let eui64: Buffer | undefined

        switch (source) {
            case Source.FILE: {
                const backupFile = await browseToFile('File location', DEFAULT_NETWORK_BACKUP_PATH)
                const backup = getBackupFromFile(backupFile)

                if (backup === undefined) {
                    // error logged in getBackupFromFile
                    return false
                }

                eui64 = backup.coordinatorIeeeAddress
                eui64Hex = `0x${Buffer.from(eui64).reverse().toString('hex')}`

                break
            }

            case Source.INPUT: {
                eui64Hex = await input({
                    message: 'EUI64',
                    default: ZSpec.BLANK_EUI64,
                    validate(value) {
                        return /^0x[0-9a-f]{16}$/i.test(value)
                    },
                })
                eui64 = Buffer.from(eui64Hex.slice(2 /* 0x */), 'hex').reverse()

                break
            }

            case -1: {
                return false
            }
        }

        if (!eui64) {
            logger.error(`Invalid EUI64, cannot procede.`)

            return false
        }

        logger.info(`Writing EUI64 ${eui64Hex} as ${eui64.toString('hex')}.`)

        await ezsp.ezspSetTokenData(tokenKey, 0, { data: eui64, size: eui64.length })

        return true
    }

    private async menuZigbee2MQTTOnboard(ezsp: Ezsp): Promise<boolean> {
        let status = await emberNetworkInit(ezsp)
        const notJoined = status === SLStatus.NOT_JOINED

        if (!notJoined && status !== SLStatus.OK) {
            logger.error(`Failed network init request with status=${SLStatus[status]}.`)
            return true
        }

        if (!notJoined) {
            const overwrite = await confirm({ default: false, message: 'A network is present in the adapter. Leave and continue onboard?' })

            if (!overwrite) {
                logger.info(`Onboard cancelled.`)
                return false
            }

            const status = await ezsp.ezspLeaveNetwork()

            if (status !== SLStatus.OK) {
                logger.error(`Failed to leave network with status=${SLStatus[status]}.`)
                return true
            }

            await waitForStackStatus(ezsp, SLStatus.NETWORK_DOWN)
        }

        // set desired tx power before scan
        const radioTxPower = Number.parseInt(
            await input({
                default: '5',
                message: 'Radio transmit power [-128-127]',
                validate(value) {
                    if (/\./.test(value)) {
                        return false
                    }

                    const v = Number.parseInt(value, 10)

                    return v >= -128 && v <= 127
                },
            }),
            10,
        )

        status = await ezsp.ezspSetRadioPower(radioTxPower)

        if (status !== SLStatus.OK) {
            logger.error(`Failed to set transmit power to ${radioTxPower} status=${SLStatus[status]}.`)
            return true
        }

        // WiFi beacon frames at standard interval: 102.4msec
        const duration = await select<number>({
            choices: [
                { name: '3948 msec', value: 8 },
                { name: '1981 msec', value: 7 },
                { name: '998 msec', value: 6 },
                { name: '507 msec', value: 5 },
                { name: '261 msec', value: 4 },
                { name: '138 msec', value: 3 },
                // { name: '77 msec', value: 2 },
                // { name: '46 msec', value: 1 },
                // { name: '31 msec', value: 0 },
            ],
            default: 6,
            message: 'Duration of scan per channel',
        })

        const channels = await checkbox<number>({
            choices: ZSpec.ALL_802_15_4_CHANNELS.map((c) => ({ name: c.toString(), value: c, checked: TOUCHLINK_CHANNELS.includes(c) })),
            message: 'Channels to consider',
            required: true,
        })

        const progressBar = new SingleBar({ clearOnComplete: true, format: '{bar} {percentage}% | ETA: {eta}s' }, Presets.shades_classic)
        // a symbol is 16 microseconds, a scan period is 960 symbols
        const totalTime = (((2 ** duration + 1) * (16 * 960)) / 1000) * channels.length
        let scanCompleted: (value: [panId: number, channel: number] | PromiseLike<[panId: number, channel: number]>) => void
        // NOTE: expanding zigbee-herdsman
        const ezspUnusedPanIdFoundHandlerOriginal = ezsp.ezspUnusedPanIdFoundHandler

        ezsp.ezspUnusedPanIdFoundHandler = (panId: PanId, channel: number): void => {
            logger.debug(`ezspUnusedPanIdFoundHandler: ${JSON.stringify({ panId, channel })}`)
            progressBar.stop()
            clearInterval(progressInterval)

            if (scanCompleted) {
                scanCompleted([panId, channel])
            }
        }

        const scanStatus = await ezsp.ezspFindUnusedPanId(ZSpec.Utils.channelsToUInt32Mask(channels), duration)

        if (scanStatus !== SLStatus.OK) {
            logger.error(`Failed find unused PAN ID request with status=${SLStatus[scanStatus]}.`)
            // restore zigbee-herdsman default
            ezsp.ezspUnusedPanIdFoundHandler = ezspUnusedPanIdFoundHandlerOriginal
            return true
        }

        progressBar.start(totalTime, 0)

        const progressInterval = setInterval(() => {
            progressBar.increment(500)
        }, 500)

        const result = await new Promise<[panId: PanId, channel: number]>((resolve) => {
            scanCompleted = resolve
        })

        // restore zigbee-herdsman default
        ezsp.ezspUnusedPanIdFoundHandler = ezspUnusedPanIdFoundHandlerOriginal

        // just in case
        if (!result) {
            logger.error(`Found no suitable PAN ID and channel.`)
            return true
        }

        const [foundPanId, foundChannel] = result
        const confirmForm = await confirm({
            message: `Found suitable PAN ID=${foundPanId}, channel=${foundChannel}. Continue with these parameters?`,
            default: true,
        })

        if (!confirmForm) {
            logger.info(`Onboard cancelled.`)
            return true
        }

        const state: EmberInitialSecurityState = {
            bitmask:
                EmberInitialSecurityBitmask.TRUST_CENTER_GLOBAL_LINK_KEY |
                EmberInitialSecurityBitmask.HAVE_PRECONFIGURED_KEY |
                EmberInitialSecurityBitmask.HAVE_NETWORK_KEY |
                EmberInitialSecurityBitmask.TRUST_CENTER_USES_HASHED_LINK_KEY |
                EmberInitialSecurityBitmask.REQUIRE_ENCRYPTED_KEY,
            preconfiguredKey: { contents: randomBytes(EMBER_ENCRYPTION_KEY_SIZE) },
            networkKey: { contents: randomBytes(ZSpec.DEFAULT_ENCRYPTION_KEY_SIZE) },
            networkKeySequenceNumber: 0,
            preconfiguredTrustCenterEui64: ZSpec.BLANK_EUI64,
        }

        status = await ezsp.ezspSetInitialSecurityState(state)

        if (status !== SLStatus.OK) {
            throw new Error(`Failed to set initial security state with status=${SLStatus[status]}.`)
        }

        const extended: EmberExtendedSecurityBitmask =
            EmberExtendedSecurityBitmask.JOINER_GLOBAL_LINK_KEY | EmberExtendedSecurityBitmask.NWK_LEAVE_REQUEST_NOT_ALLOWED
        status = await ezsp.ezspSetExtendedSecurityBitmask(extended)

        if (status !== SLStatus.OK) {
            throw new Error(`Failed to set extended security bitmask to ${extended} with status=${SLStatus[status]}.`)
        }

        status = await ezsp.ezspClearKeyTable()

        if (status !== SLStatus.OK) {
            logger.error(`Failed to clear key table with status=${SLStatus[status]}.`)
        }

        const netParams: EmberNetworkParameters = {
            panId: foundPanId,
            extendedPanId: Array.from(randomBytes(ZSpec.EXTENDED_PAN_ID_SIZE)),
            radioTxPower: radioTxPower,
            radioChannel: foundChannel,
            joinMethod: EmberJoinMethod.MAC_ASSOCIATION,
            nwkManagerId: ZSpec.COORDINATOR_ADDRESS,
            nwkUpdateId: 0,
            channels: ZSpec.ALL_802_15_4_CHANNELS_MASK,
        }

        logger.info(`Forming new network with: ${JSON.stringify(netParams)}`)

        status = await ezsp.ezspFormNetwork(netParams)

        if (status !== SLStatus.OK) {
            throw new Error(`Failed form network request with status=${SLStatus[status]}.`)
        }

        await waitForStackStatus(ezsp, SLStatus.NETWORK_UP)

        status = await ezsp.ezspStartWritingStackTokens()

        logger.debug(`Start writing stack tokens status=${SLStatus[status]}.`)
        logger.info(`New network formed!`)

        // grab the actual parameters (should anything have gone wrong, this will hard fail)
        const [npStatus, , actualNetParams] = await ezsp.ezspGetNetworkParameters()

        if (npStatus !== SLStatus.OK) {
            throw new Error(`Failed to get network parameters with status=${SLStatus[npStatus]}.`)
        }

        // write partial `configuration.yaml`
        const saveFile = await browseToFile('Configuration save file', DEFAULT_CONFIGURATION_YAML_PATH, true)
        const extensions = await checkbox<string>({
            choices: [
                { name: 'Frontend', value: 'frontend', checked: true },
                { name: 'Home Assistant', value: 'homeassistant', checked: false },
            ],
            message: 'Extensions to enable',
        })
        const enableExtFrontend = extensions.includes('frontend')
        const enableExtHomeAssistant = extensions.includes('homeassistant')
        const mqttServer = await input({
            message: 'Address of the MQTT server',
            default: enableExtHomeAssistant ? 'mqtt://core-mosquitto:1883' : 'mqtt://localhost:1883',
        })
        // @ts-expect-error private, avoids passing portConf around just for this
        const { baudRate, path, rtscts } = ezsp.ash.portOptions

        const yaml = `
mqtt:
    base_topic: zigbee2mqtt
    server: ${mqttServer}
serial:
    adapter: ember
    baudrate: ${baudRate}
    port: ${path}
    rtscts: ${rtscts}
advanced:
    log_level: info
    pan_id: ${actualNetParams.panId}
    ext_pan_id: [${actualNetParams.extendedPanId}]
    network_key: [${Array.from(state.networkKey.contents)}]
    channel: ${actualNetParams.radioChannel}
    transmit_power: ${actualNetParams.radioTxPower}
frontend: ${enableExtFrontend}
homeassistant: ${enableExtHomeAssistant}
`

        writeFileSync(saveFile, yaml, 'utf8')

        logger.info(`Zigbee2MQTT starter configuration written to '${saveFile}'. Adjust it as necessary (port, etc.).`)

        return true
    }

    private async navigateMenu(ezsp: Ezsp): Promise<boolean> {
        const answer = await select<-1 | StackMenu>({
            choices: [
                { name: 'Get stack info', value: StackMenu.STACK_INFO },
                { name: 'Get stack config (firmware defaults)', value: StackMenu.STACK_CONFIG },
                { name: 'Get network info', value: StackMenu.NETWORK_INFO },
                { name: 'Scan network', value: StackMenu.NETWORK_SCAN },
                { name: 'Backup network', value: StackMenu.NETWORK_BACKUP },
                { name: 'Restore network', value: StackMenu.NETWORK_RESTORE },
                { name: 'Leave network', value: StackMenu.NETWORK_LEAVE },
                { name: 'Backup NVM3 tokens', value: StackMenu.TOKENS_BACKUP },
                { name: 'Restore NVM3 tokens', value: StackMenu.TOKENS_RESTORE },
                { name: 'Reset NVM3 tokens', value: StackMenu.TOKENS_RESET },
                { name: 'Write EUI64 NVM3 token', value: StackMenu.TOKENS_WRITE_EUI64 },
                { name: 'Get security info', value: StackMenu.SECURITY_INFO },
                { name: 'Zigbee2MQTT Onboard (auto configuration)', value: StackMenu.ZIGBEE2MQTT_ONBOARD },
                { name: 'Repairs', value: StackMenu.REPAIRS },
                { name: 'Exit', value: -1 },
            ],
            message: 'Menu',
        })

        switch (answer) {
            case StackMenu.STACK_INFO: {
                return this.menuStackInfo()
            }

            case StackMenu.STACK_CONFIG: {
                return this.menuStackConfig(ezsp)
            }

            case StackMenu.NETWORK_INFO: {
                return this.menuNetworkInfo(ezsp)
            }

            case StackMenu.NETWORK_SCAN: {
                return this.menuNetworkScan(ezsp)
            }

            case StackMenu.NETWORK_BACKUP: {
                return this.menuNetworkBackup(ezsp)
            }

            case StackMenu.NETWORK_RESTORE: {
                return this.menuNetworkRestore(ezsp)
            }

            case StackMenu.NETWORK_LEAVE: {
                return this.menuNetworkLeave(ezsp)
            }

            case StackMenu.TOKENS_BACKUP: {
                return this.menuTokensBackup(ezsp)
            }

            case StackMenu.TOKENS_RESTORE: {
                return this.menuTokensRestore(ezsp)
            }

            case StackMenu.TOKENS_RESET: {
                return this.menuTokensReset(ezsp)
            }

            case StackMenu.TOKENS_WRITE_EUI64: {
                return this.menuTokensWriteEUI64(ezsp)
            }

            case StackMenu.SECURITY_INFO: {
                return this.menuSecurityInfo(ezsp)
            }

            case StackMenu.ZIGBEE2MQTT_ONBOARD: {
                return this.menuZigbee2MQTTOnboard(ezsp)
            }

            case StackMenu.REPAIRS: {
                return this.menuRepairs(ezsp)
            }
        }

        return true // exit
    }
}
