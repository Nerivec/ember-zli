import { readFileSync } from 'node:fs'
import { ZSpec } from 'zigbee-herdsman'
import { EmberLibraryId, EmberLibraryStatus, EmberNetworkInitBitmask, EmberVersionType, SLStatus } from 'zigbee-herdsman/dist/adapter/ember/enums.js'
import { EZSP_MIN_PROTOCOL_VERSION, EZSP_PROTOCOL_VERSION, EZSP_STACK_TYPE_MESH } from 'zigbee-herdsman/dist/adapter/ember/ezsp/consts.js'
import { EzspConfigId } from 'zigbee-herdsman/dist/adapter/ember/ezsp/enums.js'
import { Ezsp, EzspEvents } from 'zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js'
import { EmberNetworkInitStruct } from 'zigbee-herdsman/dist/adapter/ember/types.js'
import { Backup } from 'zigbee-herdsman/dist/models/backup.js'
import { UnifiedBackupStorage } from 'zigbee-herdsman/dist/models/backup-storage-unified.js'
import { fromUnifiedBackup } from 'zigbee-herdsman/dist/utils/backup.js'

import { logger } from '../index.js'
import { NVM3ObjectKey } from './enums.js'
import { EmberFullVersion, PortConf } from './types.js'

const NS = { namespace: 'ember' }
const STACK_PROFILE_ZIGBEE_PRO = 2
export let emberFullVersion: EmberFullVersion

export const waitForStackStatus = async (ezsp: Ezsp, status: SLStatus, timeout: number = 10000): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            ezsp.removeListener(EzspEvents.STACK_STATUS, onStackStatus)
            return reject(new Error(`Timed out waiting for stack status '${SLStatus[status]}'.`))
        }, timeout)
        const onStackStatus = (receivedStatus: SLStatus): void => {
            logger.debug(`Received stack status ${receivedStatus} while waiting for ${status}.`, NS)

            if (status === receivedStatus) {
                clearTimeout(timeoutHandle)
                ezsp.removeListener(EzspEvents.STACK_STATUS, onStackStatus)
                resolve()
            }
        }

        ezsp.on(EzspEvents.STACK_STATUS, onStackStatus)
    })

export const emberStart = async (portConf: PortConf): Promise<Ezsp> => {
    const ezsp = new Ezsp({ adapter: 'ember', ...portConf })

    // NOTE: something deep in this call can throw too
    const startResult = await ezsp.start()

    if (startResult !== 0) {
        throw new Error(`Failed to start EZSP layer with status=${startResult}.`)
    }

    // call before any other command, else fails
    emberFullVersion = await emberVersion(ezsp)

    return ezsp
}

export const emberStop = async (ezsp: Ezsp): Promise<void> => {
    // workaround to remove ASH COUNTERS logged on stop
    // @ts-expect-error workaround (overriding private)
    ezsp.ash.logCounters = () => {}

    await ezsp.stop()
}

export const emberVersion = async (ezsp: Ezsp): Promise<EmberFullVersion> => {
    // send the Host version number to the NCP.
    // The NCP returns the EZSP version that the NCP is running along with the stackType and stackVersion
    let [ncpEzspProtocolVer, ncpStackType, ncpStackVer] = await ezsp.ezspVersion(EZSP_PROTOCOL_VERSION)

    // verify that the stack type is what is expected
    if (ncpStackType !== EZSP_STACK_TYPE_MESH) {
        throw new Error(`Stack type ${ncpStackType} is not expected!`)
    }

    if (ncpEzspProtocolVer === EZSP_PROTOCOL_VERSION) {
        logger.debug(`NCP EZSP protocol version (${ncpEzspProtocolVer}) matches Host.`, NS)
    } else if (ncpEzspProtocolVer < EZSP_PROTOCOL_VERSION && ncpEzspProtocolVer >= EZSP_MIN_PROTOCOL_VERSION) {
        ;[ncpEzspProtocolVer, ncpStackType, ncpStackVer] = await ezsp.ezspVersion(ncpEzspProtocolVer)

        logger.info(`NCP EZSP protocol version (${ncpEzspProtocolVer}) lower than Host. Switched.`, NS)
    } else {
        throw new Error(
            `NCP EZSP protocol version (${ncpEzspProtocolVer}) is not supported by Host [${EZSP_MIN_PROTOCOL_VERSION}-${EZSP_PROTOCOL_VERSION}].`,
        )
    }

    logger.debug(`NCP info: EZSPVersion=${ncpEzspProtocolVer} StackType=${ncpStackType} StackVersion=${ncpStackVer}`, NS)

    const [status, versionStruct] = await ezsp.ezspGetVersionStruct()

    if (status !== SLStatus.OK) {
        // Should never happen with support of only EZSP v13+
        throw new Error(`NCP has old-style version number. Not supported.`)
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

export const emberNetworkInit = async (ezsp: Ezsp): Promise<SLStatus> => {
    // required for proper network init
    const status = await ezsp.ezspSetConfigurationValue(EzspConfigId.STACK_PROFILE, STACK_PROFILE_ZIGBEE_PRO)

    if (status !== SLStatus.OK) {
        throw new Error(`Failed to set stack profile with status=${SLStatus[status]}.`)
    }

    const networkInitStruct: EmberNetworkInitStruct = {
        bitmask: EmberNetworkInitBitmask.PARENT_INFO_IN_TOKEN | EmberNetworkInitBitmask.END_DEVICE_REJOIN_ON_REBOOT,
    }

    return ezsp.ezspNetworkInit(networkInitStruct)
}

// -- Utils

export const getLibraryStatus = (id: EmberLibraryId, status: EmberLibraryStatus): string => {
    if (status === EmberLibraryStatus.LIBRARY_ERROR) {
        return 'ERROR'
    }

    const present = Boolean(status & EmberLibraryStatus.LIBRARY_PRESENT_MASK)

    let statusStr: string = 'NOT_PRESENT'

    if (present) {
        statusStr = 'PRESENT'

        if (id === EmberLibraryId.ZIGBEE_PRO) {
            statusStr += status & EmberLibraryStatus.ZIGBEE_PRO_LIBRARY_HAVE_ROUTER_CAPABILITY ? ' / ROUTER_CAPABILITY' : ' / END_DEVICE_ONLY'

            if (status & EmberLibraryStatus.ZIGBEE_PRO_LIBRARY_ZLL_SUPPORT) {
                statusStr += ' / ZLL_SUPPORT'
            }
        }

        if (id === EmberLibraryId.SECURITY_CORE) {
            statusStr += status & EmberLibraryStatus.SECURITY_LIBRARY_HAVE_ROUTER_SUPPORT ? ' / ROUTER_SUPPORT' : ' / END_DEVICE_ONLY'
        }

        if (id === EmberLibraryId.PACKET_VALIDATE) {
            statusStr += status & EmberLibraryStatus.PACKET_VALIDATE_LIBRARY_ENABLED ? ' / ENABLED' : ' / DISABLED'
        }
    }

    return statusStr
}

export const parseTokenData = (nvm3Key: NVM3ObjectKey, data: Buffer): string => {
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
            return (
                `PAN ID: ${data.subarray(0, 2).toString('hex')} | Radio TX Power ${data.readUInt8(2)} | Radio Channel ${data.readUInt8(3)} ` +
                `| ${data.subarray(4, 8).toString('hex')} | Ext PAN ID: ${data.subarray(8, 16).toString('hex')}`
            )
        }

        case NVM3ObjectKey.STACK_NETWORK_MANAGEMENT: {
            // TODO
            return `Channels: ${ZSpec.Utils.uint32MaskToChannels(data.readUInt32LE(0))} | ${data.subarray(4).toString('hex')}`
        }

        default: {
            return data.toString('hex')
        }
    }
}

export const getBackupFromFile = (backupFile: string): Backup | undefined => {
    try {
        const data: UnifiedBackupStorage = JSON.parse(readFileSync(backupFile, 'utf8'))

        if (data.metadata?.format === 'zigpy/open-coordinator-backup' && data.metadata?.version) {
            if (data.metadata?.version !== 1) {
                logger.error(`Unsupported open coordinator backup version (version=${data.metadata?.version}). Cannot restore.`)
                return undefined
            }

            if (!data.stack_specific?.ezsp || !data.metadata.internal.ezspVersion) {
                logger.error(`Current backup file is not for EmberZNet stack. Cannot restore.`)
                return undefined
            }

            if (!data.stack_specific?.ezsp?.hashed_tclk) {
                logger.error(`Current backup file does not contain the Trust Center Link Key. Cannot restore.`)
                return undefined
            }

            return fromUnifiedBackup(data)
        }

        logger.error(`Unknown backup format.`)
    } catch (error) {
        logger.error(`Not valid backup found. ${error}`)
    }

    return undefined
}
