import { Command } from '@oclif/core'
import { readFileSync } from 'node:fs'
import { ZSpec } from 'zigbee-herdsman'
import {
    EmberLibraryId,
    EmberLibraryStatus,
    EmberNetworkInitBitmask,
    EmberStatus,
    EmberVersionType,
    EzspStatus,
    SLStatus,
    SecManKeyType
} from 'zigbee-herdsman/dist/adapter/ember/enums.js'
import { EZSP_PROTOCOL_VERSION, EZSP_STACK_TYPE_MESH } from 'zigbee-herdsman/dist/adapter/ember/ezsp/consts.js'
import { EzspConfigId, EzspDecisionBitmask, EzspDecisionId, EzspMfgTokenId, EzspPolicyId } from 'zigbee-herdsman/dist/adapter/ember/ezsp/enums.js'
import { Ezsp, EzspEvents } from 'zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js'
import { EmberNetworkInitStruct, SecManContext } from 'zigbee-herdsman/dist/adapter/ember/types.js'
import { initSecurityManagerContext } from 'zigbee-herdsman/dist/adapter/ember/utils/initters.js'
import { Backup } from 'zigbee-herdsman/dist/models/backup.js'
import { UnifiedBackupStorage } from 'zigbee-herdsman/dist/models/backup-storage-unified.js'
import { fromUnifiedBackup } from 'zigbee-herdsman/dist/utils/backup.js'

import { logger } from '../index.js'
import { ConfigValue, EmberFullVersion, PortConf } from './types.js'

const NS = { namespace: 'ember' }
const STACK_PROFILE_ZIGBEE_PRO = 2
export let emberFullVersion: EmberFullVersion

export const waitForStackStatus = async (cmd: Command, ezsp: Ezsp, status: EmberStatus, timeout: number = 10000): Promise<void> => new Promise<void>((resolve) => {
    const timeoutHandle = setTimeout(() => {
        logger.error(`Timed out waiting for stack status '${EmberStatus[status]}'.`, NS)
        return cmd.exit(1)
    }, timeout)

    ezsp.on(EzspEvents.STACK_STATUS, (receivedStatus: EmberStatus) => {
        logger.debug(`Received stack status ${receivedStatus} while waiting for ${status}.`, NS)
        if (status === receivedStatus) {
            clearTimeout(timeoutHandle)
            resolve()
        }
    })
})

export const emberStart = async (cmd: Command, portConf: PortConf): Promise<Ezsp> => {
    const ezsp = new Ezsp(5, { adapter: 'ember', ...portConf })

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

    if (ncpEzspProtocolVer < EZSP_PROTOCOL_VERSION) {
        [ncpEzspProtocolVer, ncpStackType, ncpStackVer] = await ezsp.ezspVersion(ncpEzspProtocolVer)

        logger.warning(`NCP EZSP version (${ncpEzspProtocolVer}) is lower than host (${EZSP_PROTOCOL_VERSION}). Switched host to version ${ncpEzspProtocolVer}.`, NS)
    } else if (ncpEzspProtocolVer > EZSP_PROTOCOL_VERSION) {
        logger.error(`NCP EZSP version (${ncpEzspProtocolVer}) is not supported by host (max ${EZSP_PROTOCOL_VERSION}).`)
        return cmd.exit(1)
    }

    logger.debug(`NCP info: EZSPVersion=${ncpEzspProtocolVer} StackType=${ncpStackType} StackVersion=${ncpStackVer}`, NS)

    const [status, versionStruct] = await ezsp.ezspGetVersionStruct()

    if (status !== EzspStatus.SUCCESS) {
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

export const emberNetworkInit = async (cmd: Command, ezsp: Ezsp): Promise<EmberStatus> => {
    // required for proper network init
    const status = await ezsp.ezspSetConfigurationValue(EzspConfigId.STACK_PROFILE, STACK_PROFILE_ZIGBEE_PRO)

    if (status !== EzspStatus.SUCCESS) {
        logger.error(`Failed to set stack profile with status=${EzspStatus[status]}.`, NS)
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

        config[`CONFIG.${key}`] = (status === EzspStatus.SUCCESS) ? `${value}` : EzspStatus[status]
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

        config[`POLICY.TRUST_CENTER_POLICY`] = (status === EzspStatus.SUCCESS) ? tcDecisions.join(',') : EzspStatus[status]
    }

    for (const key of Object.keys(EzspPolicyId)) {
        // @ts-expect-error enum by value
        const policyId = EzspPolicyId[key]

        if (typeof policyId !== 'number' || policyId === EzspPolicyId.TRUST_CENTER_POLICY) {
            continue
        }

        const [status, value] = await ezsp.ezspGetPolicy(policyId)

        config[`CONFIG.${key}`] = (status === EzspStatus.SUCCESS) ? EzspDecisionId[value] : EzspStatus[status]
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

    if (netStatus !== EmberStatus.SUCCESS) {
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

    let context: SecManContext = initSecurityManagerContext()
    context.coreKeyType = SecManKeyType.TC_LINK
    const [tcLinkKey, tclkStatus] = (await ezsp.ezspExportKey(context))

    if (tclkStatus !== SLStatus.OK) {
        logger.error(`Failed to export TC Link Key with status=${SLStatus[tclkStatus]}.`, NS)
        return cmd.exit(1)
    }

    context = initSecurityManagerContext()// make sure it's back to zeroes
    context.coreKeyType = SecManKeyType.NETWORK
    context.keyIndex = 0
    const [networkKey, nkStatus] = (await ezsp.ezspExportKey(context))

    if (nkStatus !== SLStatus.OK) {
        logger.error(`Failed to export Network Key with status=${SLStatus[nkStatus]}.`, NS)
        return cmd.exit(1)
    }

    return {
        coordinatorIeeeAddress: Buffer.from(eui64.slice(2)/* take out 0x */, 'hex').reverse(),
        devices: [],
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
        securityLevel: 5// Z3.0
    }
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
