import { Command } from '@oclif/core'
import { readFileSync } from 'node:fs'
import { ZSpec } from 'zigbee-herdsman'
import { EmberTokensManager } from 'zigbee-herdsman/dist/adapter/ember/adapter/tokensManager.js'
import {
    EmberLibraryId,
    EmberLibraryStatus,
    EmberNetworkInitBitmask,
    EmberNetworkStatus,
    EmberVersionType,
    SLStatus,
    SecManKeyType
} from 'zigbee-herdsman/dist/adapter/ember/enums.js'
import { EMBER_AES_HASH_BLOCK_SIZE, EZSP_MIN_PROTOCOL_VERSION, EZSP_PROTOCOL_VERSION, EZSP_STACK_TYPE_MESH } from 'zigbee-herdsman/dist/adapter/ember/ezsp/consts.js'
import { EzspConfigId, EzspDecisionBitmask, EzspDecisionId, EzspMfgTokenId, EzspPolicyId } from 'zigbee-herdsman/dist/adapter/ember/ezsp/enums.js'
import { Ezsp, EzspEvents } from 'zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js'
import { EmberNetworkInitStruct, SecManAPSKeyMetadata, SecManContext, SecManKey } from 'zigbee-herdsman/dist/adapter/ember/types.js'
import { initSecurityManagerContext } from 'zigbee-herdsman/dist/adapter/ember/utils/initters.js'
import { Backup } from 'zigbee-herdsman/dist/models/backup.js'
import { UnifiedBackupStorage } from 'zigbee-herdsman/dist/models/backup-storage-unified.js'
import { fromUnifiedBackup } from 'zigbee-herdsman/dist/utils/backup.js'
import { BLANK_EUI64, EUI64_SIZE } from 'zigbee-herdsman/dist/zspec/consts.js'
import { uint32MaskToChannels } from 'zigbee-herdsman/dist/zspec/utils.js'

import { logger } from '../index.js'
import { NVM3ObjectKey } from './enums.js'
import { ConfigValue, EmberFullVersion, LinkKeyBackupData, PortConf, TokensInfo } from './types.js'

const NS = { namespace: 'ember' }
const STACK_PROFILE_ZIGBEE_PRO = 2
export let emberFullVersion: EmberFullVersion

export const waitForStackStatus = async (cmd: Command, ezsp: Ezsp, status: SLStatus, timeout: number = 10000): Promise<void> => new Promise<void>((resolve) => {
    const timeoutHandle = setTimeout(() => {
        logger.error(`Timed out waiting for stack status '${SLStatus[status]}'.`, NS)
        return cmd.exit(1)
    }, timeout)

    ezsp.on(EzspEvents.STACK_STATUS, (receivedStatus: SLStatus) => {
        logger.debug(`Received stack status ${receivedStatus} while waiting for ${status}.`, NS)
        if (status === receivedStatus) {
            clearTimeout(timeoutHandle)
            resolve()
        }
    })
})

export const emberStart = async (cmd: Command, portConf: PortConf): Promise<Ezsp> => {
    const ezsp = new Ezsp({ adapter: 'ember', ...portConf })

    // NOTE: something deep in this call can throw too
    const startResult = await ezsp.start()

    if (startResult !== 0) {
        logger.error(`Failed to start EZSP layer with status=${startResult}.`, NS)
        return cmd.exit(1)
    }

    // call before any other command, else fails
    emberFullVersion = await emberVersion(cmd, ezsp)

    return ezsp
}

export const emberStop = async (cmd: Command, ezsp: Ezsp): Promise<void> => {
    // workaround to remove ASH COUNTERS logged on stop
    // @ts-expect-error workaround (overriding private)
    ezsp.ash.logCounters = () => {}

    await ezsp.stop()
}

export const emberVersion = async (cmd: Command, ezsp: Ezsp): Promise<EmberFullVersion> => {
    // send the Host version number to the NCP.
    // The NCP returns the EZSP version that the NCP is running along with the stackType and stackVersion
    let [ncpEzspProtocolVer, ncpStackType, ncpStackVer] = await ezsp.ezspVersion(EZSP_PROTOCOL_VERSION)

    // verify that the stack type is what is expected
    if (ncpStackType !== EZSP_STACK_TYPE_MESH) {
        logger.error(`Stack type ${ncpStackType} is not expected!`, NS)
        return cmd.exit(1)
    }

    if (ncpEzspProtocolVer === EZSP_PROTOCOL_VERSION) {
        logger.debug(`NCP EZSP protocol version (${ncpEzspProtocolVer}) matches Host.`, NS)
    } else if (ncpEzspProtocolVer < EZSP_PROTOCOL_VERSION && ncpEzspProtocolVer >= EZSP_MIN_PROTOCOL_VERSION) {
        [ncpEzspProtocolVer, ncpStackType, ncpStackVer] = await ezsp.ezspVersion(ncpEzspProtocolVer)

        logger.info(`NCP EZSP protocol version (${ncpEzspProtocolVer}) lower than Host. Switched.`, NS)
    } else {
        logger.error(
            `NCP EZSP protocol version (${ncpEzspProtocolVer}) is not supported by Host [${EZSP_MIN_PROTOCOL_VERSION}-${EZSP_PROTOCOL_VERSION}].`,
            NS
        )
        return cmd.exit(1)
    }

    logger.debug(`NCP info: EZSPVersion=${ncpEzspProtocolVer} StackType=${ncpStackType} StackVersion=${ncpStackVer}`, NS)

    const [status, versionStruct] = await ezsp.ezspGetVersionStruct()

    if (status !== SLStatus.OK) {
        // Should never happen with support of only EZSP v13+
        logger.error(`NCP has old-style version number. Not supported.`, NS)
        return cmd.exit(1)
    }

    const version: EmberFullVersion = {
        ezsp: ncpEzspProtocolVer,
        revision: `${versionStruct.major}.${versionStruct.minor}.${versionStruct.patch} [${EmberVersionType[versionStruct.type]}]`,
        ...versionStruct,
    }

    if (versionStruct.type !== EmberVersionType.GA) {
        logger.warning(`NCP is running a non-GA version (${EmberVersionType[versionStruct.type]}).`, NS)
    }

    logger.info(`NCP version: ${JSON.stringify(version)}`, NS)

    return version
}

export const emberNetworkInit = async (cmd: Command, ezsp: Ezsp): Promise<SLStatus> => {
    // required for proper network init
    const status = await ezsp.ezspSetConfigurationValue(EzspConfigId.STACK_PROFILE, STACK_PROFILE_ZIGBEE_PRO)

    if (status !== SLStatus.OK) {
        logger.error(`Failed to set stack profile with status=${SLStatus[status]}.`, NS)
        return cmd.exit(1)
    }

    const networkInitStruct: EmberNetworkInitStruct = {
        bitmask: (EmberNetworkInitBitmask.PARENT_INFO_IN_TOKEN | EmberNetworkInitBitmask.END_DEVICE_REJOIN_ON_REBOOT)
    }

    return ezsp.ezspNetworkInit(networkInitStruct)
}

const getLibraryStatus = (id: EmberLibraryId, status: EmberLibraryStatus): string => {
    if (status === EmberLibraryStatus.LIBRARY_ERROR) {
        return 'ERROR'
    }

    const present = Boolean(status & EmberLibraryStatus.LIBRARY_PRESENT_MASK)

    let statusStr: string = 'NOT_PRESENT'

    if (present) {
        statusStr = 'PRESENT'

        if (id === EmberLibraryId.ZIGBEE_PRO) {
            statusStr += (status & EmberLibraryStatus.ZIGBEE_PRO_LIBRARY_HAVE_ROUTER_CAPABILITY) ? ' / ROUTER_CAPABILITY' : ' / END_DEVICE_ONLY'

            if (status & EmberLibraryStatus.ZIGBEE_PRO_LIBRARY_ZLL_SUPPORT) {
                statusStr += ' / ZLL_SUPPORT'
            }
        }

        if (id === EmberLibraryId.SECURITY_CORE) {
            statusStr += (status & EmberLibraryStatus.SECURITY_LIBRARY_HAVE_ROUTER_SUPPORT) ? ' / ROUTER_SUPPORT' : ' / END_DEVICE_ONLY'
        }

        if (id === EmberLibraryId.PACKET_VALIDATE) {
            statusStr += (status & EmberLibraryStatus.PACKET_VALIDATE_LIBRARY_ENABLED) ? ' / ENABLED' : ' / DISABLED'
        }

    }

    return statusStr
}

export const getStackConfig = async (cmd: Command, ezsp: Ezsp): Promise<ConfigValue> => {
    const config: ConfigValue = {}

    for (const key of Object.keys(EzspConfigId)) {
        // @ts-expect-error enum by value
        const configId = EzspConfigId[key]

        if (typeof configId !== 'number') {
            continue
        }

        const [status, value] = await ezsp.ezspGetConfigurationValue(configId)

        config[`CONFIG.${key}`] = (status === SLStatus.OK) ? `${value}` : SLStatus[status]
    }

    {
        // needs special handling due to bitmask, excluded from below for-loop
        const [status, value] = await ezsp.ezspGetPolicy(EzspPolicyId.TRUST_CENTER_POLICY)
        const tcDecisions = []

        for (const key of Object.keys(EzspDecisionBitmask)) {
            // @ts-expect-error enum by value
            const bitmask = EzspDecisionBitmask[key]

            if (typeof bitmask !== 'number') {
                continue
            }

            if ((value & bitmask) !== 0) {
                tcDecisions.push(key)
            }
        }

        config[`POLICY.TRUST_CENTER_POLICY`] = (status === SLStatus.OK) ? tcDecisions.join(',') : SLStatus[status]
    }

    for (const key of Object.keys(EzspPolicyId)) {
        // @ts-expect-error enum by value
        const policyId = EzspPolicyId[key]

        if (typeof policyId !== 'number' || policyId === EzspPolicyId.TRUST_CENTER_POLICY) {
            continue
        }

        const [status, value] = await ezsp.ezspGetPolicy(policyId)

        config[`POLICY.${key}`] = (status === SLStatus.OK) ? EzspDecisionId[value] : SLStatus[status]
    }

    {
        // needs special handling due to zero-conflict with `FIRST`, excluded from below for-loop
        const status = await ezsp.ezspGetLibraryStatus(EmberLibraryId.ZIGBEE_PRO)
        config[`LIBRARY.ZIGBEE_PRO`] = getLibraryStatus(EmberLibraryId.ZIGBEE_PRO, status)
    }

    for (let i = (EmberLibraryId.FIRST + 1); i < EmberLibraryId.NUMBER_OF_LIBRARIES; i++) {
        const status = await ezsp.ezspGetLibraryStatus(i)
        config[`LIBRARY.${EmberLibraryId[i]}`] = getLibraryStatus(i, status)
    }

    for (const key of Object.keys(EzspMfgTokenId)) {
        // @ts-expect-error enum by value
        const tokenId = EzspMfgTokenId[key]

        if (typeof tokenId !== 'number') {
            continue
        }

        const [, tokenData] = await ezsp.ezspGetMfgToken(tokenId)

        config[`MFG_TOKEN.${key}`] = `${tokenData.join(',')}`
    }

    return config
}

export const backupNetwork = async(cmd: Command, ezsp: Ezsp): Promise<Backup> => {
    const [netStatus, , netParams] = await ezsp.ezspGetNetworkParameters()

    if (netStatus !== SLStatus.OK) {
        logger.error(`Failed to get network parameters.`, NS)
        return cmd.exit(1)
    }

    const eui64 = await ezsp.ezspGetEui64()
    const [netKeyStatus, netKeyInfo] = (await ezsp.ezspGetNetworkKeyInfo())

    if (netKeyStatus !== SLStatus.OK) {
        logger.error(`Failed to get network keys info.`, NS)
        return cmd.exit(1)
    }

    if (!netKeyInfo.networkKeySet) {
        logger.error(`No network key set.`, NS)
        return cmd.exit(1)
    }

    const keyList: LinkKeyBackupData[] = await exportLinkKeys(cmd, ezsp)

    let context: SecManContext = initSecurityManagerContext()
    context.coreKeyType = SecManKeyType.TC_LINK
    const [tclkStatus, tcLinkKey] = (await ezsp.ezspExportKey(context))

    if (tclkStatus !== SLStatus.OK) {
        logger.error(`Failed to export TC Link Key with status=${SLStatus[tclkStatus]}.`, NS)
        return cmd.exit(1)
    }

    context = initSecurityManagerContext()// make sure it's back to zeroes
    context.coreKeyType = SecManKeyType.NETWORK
    context.keyIndex = 0
    const [nkStatus, networkKey] = (await ezsp.ezspExportKey(context))

    if (nkStatus !== SLStatus.OK) {
        logger.error(`Failed to export Network Key with status=${SLStatus[nkStatus]}.`, NS)
        return cmd.exit(1)
    }

    return {
        coordinatorIeeeAddress: Buffer.from(eui64.slice(2)/* take out 0x */, 'hex').reverse(),
        devices: keyList.map((key) => ({
            networkAddress: ZSpec.NULL_NODE_ID,// not used for restore, no reason to make NCP calls for nothing
            ieeeAddress: Buffer.from(key.deviceEui64.slice(2)/* take out 0x */, 'hex').reverse(),
            isDirectChild: false,// not used
            linkKey: {
                key: key.key.contents,
                rxCounter: key.incomingFrameCounter,
                txCounter: key.outgoingFrameCounter,
            },
        })),
        ezsp: {
            // eslint-disable-next-line camelcase
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
            panId: netParams.panId,// uint16_t
        },
        networkUpdateId: netParams.nwkUpdateId,
        securityLevel: 5,// Z3.0
    }
}

export const exportLinkKeys = async (cmd: Command, ezsp: Ezsp): Promise<LinkKeyBackupData[]> => {
    const [confStatus, keyTableSize] = (await ezsp.ezspGetConfigurationValue(EzspConfigId.KEY_TABLE_SIZE))

    if (confStatus !== SLStatus.OK) {
        logger.error(`Failed to retrieve key table size from NCP with status=${SLStatus[confStatus]}.`, NS)
        return cmd.exit(1)
    }

    let context: SecManContext
    let plaintextKey: SecManKey
    let apsKeyMeta: SecManAPSKeyMetadata
    let status: SLStatus
    const keyList: LinkKeyBackupData[] = []

    for (let i = 0; i < keyTableSize; i++) {
        [status, context, plaintextKey, apsKeyMeta] = (await ezsp.ezspExportLinkKeyByIndex(i))
        logger.debug(`Export link key at index ${i}, status=${SLStatus[status]}.`, NS)

        // only include key if we could retrieve one at index and hash it properly
        if (status === SLStatus.OK) {
            // Rather than give the real link key, the backup contains a hashed version of the key.
            // This is done to prevent a compromise of the backup data from compromising the current link keys.
            // This is per the Smart Energy spec.
            const [hashStatus, returnContext] = await ezsp.ezspAesMmoHash(
                { result: Buffer.alloc(EMBER_AES_HASH_BLOCK_SIZE), length: 0x00000000 },
                true,
                plaintextKey.contents
            )

            if (hashStatus === SLStatus.OK) {
                keyList.push({
                    deviceEui64: context.eui64,
                    key: {contents: returnContext.result},
                    outgoingFrameCounter: apsKeyMeta.outgoingFrameCounter,
                    incomingFrameCounter: apsKeyMeta.incomingFrameCounter,
                })
            } else {
                // this should never happen?
                logger.error(`Failed to hash link key at index ${i} with status=${SLStatus[hashStatus]}. Omitting from backup.`, NS)
            }
        }
    }

    logger.info(`Retrieved ${keyList.length} link keys.`, NS)

    return keyList
}

export const importLinkKeys =  async (cmd: Command, ezsp: Ezsp, backupData: LinkKeyBackupData[]): Promise<void> => {
    if (backupData.length === 0) {
        return
    }

    const [confStatus, keyTableSize] = (await ezsp.ezspGetConfigurationValue(EzspConfigId.KEY_TABLE_SIZE))

    if (confStatus !== SLStatus.OK) {
        logger.error(`Failed to retrieve key table size from NCP with status=${SLStatus[confStatus]}.`, NS)
        return cmd.exit(1)
    }

    if (backupData.length > keyTableSize) {
        logger.error(`Current key table of ${keyTableSize} is too small to import backup of ${backupData.length}!`, NS)
        return cmd.exit(1)
    }

    const networkStatus = await ezsp.ezspNetworkState()

    if (networkStatus !== EmberNetworkStatus.NO_NETWORK) {
        logger.error(`Cannot import TC data while network is up, networkStatus=${EmberNetworkStatus[networkStatus]}.`, NS)
        return cmd.exit(1)
    }

    let status: SLStatus

    for (let i = 0; i < keyTableSize; i++) {
        // erase any key index not present in backup but available on the NCP
        status = (i >= backupData.length) ? await ezsp.ezspEraseKeyTableEntry(i) :
            await ezsp.ezspImportLinkKey(i, backupData[i].deviceEui64, backupData[i].key)

        if (status !== SLStatus.OK) {
            logger.error(`Failed to ${((i >= backupData.length) ? "erase" : "set")} key table entry at index ${i} `
                + `with status=${SLStatus[status]}`, NS)
        }
    }

    logger.info(`Imported ${backupData.length} keys.`, NS)
}

export const getBackup = (cmd: Command, path: string): Backup | undefined => {
    try {
        const data: UnifiedBackupStorage = JSON.parse(readFileSync(path, 'utf8'))

        if (data.metadata?.format === "zigpy/open-coordinator-backup" && data.metadata?.version) {
            if (data.metadata?.version !== 1) {
                logger.error(`Unsupported open coordinator backup version (version=${data.metadata?.version}). Cannot restore.`, NS)
                return undefined
            }

            if (!data.stack_specific?.ezsp || !data.metadata.internal.ezspVersion) {
                logger.error(`Current backup file is not for EmberZNet stack. Cannot restore.`, NS)
                return undefined
            }

            if (!data.stack_specific?.ezsp?.hashed_tclk) {
                logger.error(`Current backup file does not contain the Trust Center Link Key. Cannot restore.`, NS)
                return undefined
            }

            return fromUnifiedBackup(data)
        }

        logger.error(`Unknown backup format.`, NS)
    } catch (error) {
        logger.error(`Not valid backup found. Aborted. ${error}.`, NS)
    }

    return undefined
}

const parseTokenData = (nvm3Key: NVM3ObjectKey, data: Buffer): string => {
    switch (nvm3Key) {
        case NVM3ObjectKey.STACK_BOOT_COUNTER:
        case NVM3ObjectKey.STACK_NONCE_COUNTER:
        case NVM3ObjectKey.STACK_ANALYSIS_REBOOT:
        case NVM3ObjectKey.MULTI_NETWORK_STACK_NONCE_COUNTER:
        case NVM3ObjectKey.STACK_APS_FRAME_COUNTER:
        case NVM3ObjectKey.STACK_GP_INCOMING_FC:
        case NVM3ObjectKey.STACK_GP_INCOMING_FC_IN_SINK: {
            return `${data.readUIntLE(0, data.length)}`
        }

        case NVM3ObjectKey.STACK_MIN_RECEIVED_RSSI: {
            return `${data.readIntLE(0, data.length)}`
        }

        case NVM3ObjectKey.STACK_CHILD_TABLE: {
            // TODO
            return `EUI64: ${data.subarray(0, 8).toString('hex')} | ${data.subarray(8).toString('hex')}`
        }

        // TODO:
        // case NVM3ObjectKey.STACK_BINDING_TABLE: {}

        // TODO:
        // case NVM3ObjectKey.STACK_KEY_TABLE: {}

        case NVM3ObjectKey.STACK_TRUST_CENTER: {
            // TODO
            return `${data.subarray(0, 2).toString('hex')} | EUI64: ${data.subarray(2, 10).toString('hex')} | Link Key: ${data.subarray(10).toString('hex')}`
        }

        case NVM3ObjectKey.STACK_KEYS:
        case NVM3ObjectKey.STACK_ALTERNATE_KEY: {
            // TODO
            return `Network Key: ${data.subarray(0, -1).toString('hex')} | Sequence Number: ${data.readUInt8(16)}`
        }

        case NVM3ObjectKey.STACK_NODE_DATA: {
            // TODO
            // [4-5] === network join status?
            return `PAN ID: ${data.subarray(0, 2).toString('hex')} | Radio TX Power ${data.readUInt8(2)} | Radio Channel ${data.readUInt8(3)} `
                + `| ${data.subarray(4, 8).toString('hex')} | Ext PAN ID: ${data.subarray(8, 16).toString('hex')}`
        }

        case NVM3ObjectKey.STACK_NETWORK_MANAGEMENT: {
            // TODO
            return `Channels: ${uint32MaskToChannels(data.readUInt32LE(0))} | ${data.subarray(4).toString('hex')}`
        }

        default: {
            return data.toString('hex')
        }
    }
}

export const getTokensInfo = async (cmd: Command, ezsp: Ezsp): Promise<TokensInfo | null> => {
    logger.info(`[TOKENS] Getting tokens...`, NS)
    const tokenCount = (await ezsp.ezspGetTokenCount())

    if (!tokenCount) {
        // ezspGetTokenCount == 0 OR (ezspGetTokenInfo|ezspGetTokenData|ezspSetTokenData return LIBRARY_NOT_PRESENT)
        // ezspTokenFactoryReset will do nothing.
        logger.error(`[TOKENS] Saving tokens not supported by adapter (not NVM3-based).`, NS)
    
        return null
    }

    const allTokens: TokensInfo = []
    // returns 1 if NCP has secure key storage (where these tokens do not store the key data).
    const hasSecureStorage: boolean = (await EmberTokensManager.ncpUsesPSAKeyStorage(ezsp))

    logger.debug(`[TOKENS] Getting ${tokenCount} tokens, ${hasSecureStorage ? "with" : "without"} secure storage.`, NS)

    for (let i = 0; i < tokenCount; i++) {
        const [tiStatus, tokenInfo] = (await ezsp.ezspGetTokenInfo(i))

        if (tiStatus !== SLStatus.OK) {
            logger.error(`[TOKENS] Failed to get token info at index ${i} with status=${SLStatus[tiStatus]}.`, NS)
            continue
        }

        // buffers as hex strings
        const data: string[] = []

        for (let arrayIndex = 0; arrayIndex < tokenInfo.arraySize; arrayIndex++) {
            const [tdStatus, tokenData] = (await ezsp.ezspGetTokenData(tokenInfo.nvm3Key, arrayIndex))
    
            if (tdStatus !== SLStatus.OK) {
                logger.error(`[TOKENS] Failed to get token data at index ${arrayIndex} with status=${SLStatus[tdStatus]}.`, NS)
                continue
            }

            if (hasSecureStorage) {
                // Populate keys into tokenData because tokens do not contain them with secure key storage
                await EmberTokensManager.saveKeysToData(ezsp, tokenData, tokenInfo.nvm3Key, arrayIndex)

                // ensure the token data was retrieved properly, length should match the size announced by the token info
                if (tokenData.data.length !== tokenInfo.size) {
                    logger.error(
                        `[TOKENS] Mismatch in token data size; got ${tokenData.data.length}, expected ${tokenInfo.size}.`,
                        NS,
                    )
                }
            }

            // Check the Key to see if the token to save is restoredEui64, in that case
            // check if it is blank, then save the node EUI64 in its place, else save the value
            // received from the API. Once it saves, during restore process the set token will
            // simply write the restoredEUI64 and the node will start to use that.
            if (tokenInfo.nvm3Key === NVM3ObjectKey.STACK_RESTORED_EUI64 && tokenData.size === EUI64_SIZE
                && (tokenData.data.equals(Buffer.from(BLANK_EUI64.slice(2), 'hex')))) {
                logger.info(`[TOKENS] RESTORED EUI64 is blank. It will be replaced with node EUI64 on backup.`, NS)
            }

            const parsedTokenData = parseTokenData(tokenInfo.nvm3Key, tokenData.data)

            logger.info(`[TOKENS] nvm3Key=${NVM3ObjectKey[tokenInfo.nvm3Key]} size=${tokenInfo.size} token=[${parsedTokenData}]`, NS)
            data.push(parsedTokenData)
        }

        allTokens.push({
            nvm3Key: NVM3ObjectKey[tokenInfo.nvm3Key] ?? tokenInfo.nvm3Key,
            size: tokenInfo.size,
            arraySize: tokenInfo.arraySize,
            data,
        })
    }

    return allTokens
}
