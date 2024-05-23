import { checkbox, confirm, input, select } from '@inquirer/prompts'
import { Command, Flags } from '@oclif/core'
import { Presets, SingleBar } from 'cli-progress'
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { ZSpec } from 'zigbee-herdsman'
import { EmberTokensManager } from 'zigbee-herdsman/dist/adapter/ember/adapter/tokensManager.js'
import { EmberExtendedSecurityBitmask, EmberInitialSecurityBitmask, EmberJoinMethod, EmberNodeType, EmberStatus, EzspNetworkScanType, EzspStatus, SLStatus, SecManKeyType } from 'zigbee-herdsman/dist/adapter/ember/enums.js'
import { Ezsp } from 'zigbee-herdsman/dist/adapter/ember/ezsp/ezsp.js'
import { EmberInitialSecurityState, EmberNetworkParameters, EmberZigbeeNetwork, SecManContext } from 'zigbee-herdsman/dist/adapter/ember/types.js'
import { initSecurityManagerContext } from 'zigbee-herdsman/dist/adapter/ember/utils/initters.js'
import { toUnifiedBackup } from 'zigbee-herdsman/dist/utils/backup.js'

import { DATA_FOLDER, DEFAULT_NETWORK_BACKUP_PATH, DEFAULT_STACK_CONFIG_PATH, DEFAULT_TOKENS_BACKUP_PATH, logger } from '../../index.js'
import { backupNetwork, emberFullVersion, emberNetworkInit, emberStart, emberStop, getBackup, getStackConfig, waitForStackStatus } from '../../utils/ember.js'
import { getPortConf } from '../../utils/port.js'

enum StackMenu {
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

    SECURITY_INFO = 30,

    REPAIRS = 99,
}

enum RepairId {
    EUI64_MISMATCH = 0,
}

const BULLET_FULL = '\u2022'
const BULLET_EMPTY = '\u2219'

// from EmberTokensManager
const NVM3KEY_DOMAIN_ZIGBEE        = 0x10000
const NVM3KEY_STACK_TRUST_CENTER   = (NVM3KEY_DOMAIN_ZIGBEE | 0xE124)

export default class Stack extends Command {
    static override args = {
    }

    static override description = 'Interact with the EmberZNet stack in the adapter.'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ask: Flags.boolean({ char: 'a', description: 'Ask conf questions, even if conf file present (override file with new answers).' }),
    }

    public async run(): Promise<void> {
        const {flags} = await this.parse(Stack)
        const portConf = await getPortConf(!flags.ask)
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`)

        let ezsp = await emberStart(this, portConf)
        let exit: boolean = false

        while (!exit) {
            exit = await this.navigateMenu(ezsp)

            if (exit) {
                const restart = await confirm({
                    default: true,
                    message: 'Restart? (If no, exit)',
                })

                if (restart) {
                    await emberStop(this, ezsp)
                    ezsp = await emberStart(this, portConf)
                    exit = false
                }
            }
        }

        await emberStop(this, ezsp)

        return this.exit(0)
    }

    private async browseToFile(message: string, defaultValue: string, selectInData: boolean = false): Promise<string> {
        const choices = [
            { name: `Use default (${defaultValue})`, value: 0 },
            { name: `Enter path manually`, value: 1 },
        ]

        if (selectInData) {
            choices.push({ name: `Select in data folder (${DATA_FOLDER})`, value: 2 })
        }

        const pathOpt = await select<number>({ choices, message })
        let filepath: string = defaultValue

        switch (pathOpt) {
            case 1: {
                filepath = await input({
                    message: 'Enter path to file',
                    validate(path: string): boolean {
                        return existsSync(dirname(path)) && extname(path) === extname(defaultValue)
                    },
                })

                break
            }

            case 2: {
                const files = readdirSync(DATA_FOLDER)
                const fileChoices = []

                for (const file of files) {
                    if (extname(file) === extname(defaultValue)) {
                        fileChoices.push({ name: file, value: file })
                    }
                }

                if (fileChoices.length === 0) {
                    logger.error(`Found no file in '${DATA_FOLDER}'. Using default '${defaultValue}'.`)
                    break
                }

                filepath = join(DATA_FOLDER, await select<string>({
                    choices: fileChoices,
                    message,
                }))

                break
            }
        }

        if (!selectInData && existsSync(filepath)) {
            const rename = await select<number>({
                choices: [
                    { name: `Overwrite`, value: 0 },
                    { name: `Rename`, value: 1 },
                ],
                message: 'File already exists',
            })

            if (rename === 1) {
                const renamed = `${filepath}-${Date.now()}.old`

                logger.info(`Renaming existing file to '${renamed}'.`)
                renameSync(filepath, renamed)
            }
        }

        return filepath
    }

    private async menuNetworkBackup(ezsp: Ezsp): Promise<boolean> {
        const saveFile = await this.browseToFile('Network backup save file', DEFAULT_NETWORK_BACKUP_PATH)

        const initStatus = await emberNetworkInit(this, ezsp)

        if (initStatus === EmberStatus.NOT_JOINED) {
            logger.error(`No network present.`)
            return true
        }

        if (initStatus !== EmberStatus.SUCCESS) {
            logger.error(`Failed network init request with status=${EmberStatus[initStatus]}.`)
            return true
        }

        await waitForStackStatus(this, ezsp, EmberStatus.NETWORK_UP)

        const backup = await backupNetwork(this, ezsp)
        const unifiedBackup = await toUnifiedBackup(backup)

        writeFileSync(saveFile, JSON.stringify(unifiedBackup, null, 2), 'utf8')

        logger.info(`Network backup written to '${saveFile}'.`)

        return true
    }

    private async menuNetworkInfo(ezsp: Ezsp): Promise<boolean> {
        const initStatus = await emberNetworkInit(this, ezsp)

        if (initStatus === EmberStatus.NOT_JOINED) {
            logger.error(`No network present.`)
            return true
        }

        if (initStatus !== EmberStatus.SUCCESS) {
            logger.error(`Failed network init request with status=${EmberStatus[initStatus]}.`)
            return true
        }

        await waitForStackStatus(this, ezsp, EmberStatus.NETWORK_UP)

        const [netStatus, nodeType, netParams] = await ezsp.ezspGetNetworkParameters()

        if (netStatus !== EmberStatus.SUCCESS) {
            logger.error(`Failed to get network parameters.`)
            return true
        }

        const eui64 = await ezsp.ezspGetEui64()

        logger.info(`Node address=${eui64}, type=${EmberNodeType[nodeType]}.`)
        logger.info(`Network parameters:`)
        logger.info(`  - PAN ID: ${netParams.panId}`)
        logger.info(`  - Extended PAN ID: ${netParams.extendedPanId}`)
        logger.info(`  - Radio Channel: ${netParams.radioChannel}`)
        logger.info(`  - Radio Power: ${netParams.radioTxPower} dBm`)
        logger.info(`  - Preferred Channels: ${ZSpec.Utils.uint32MaskToChannels(netParams.channels).join(',')}`)

        return true
    }

    private async menuNetworkLeave(ezsp: Ezsp): Promise<boolean> {
        const confirmed = await confirm({ default: false, message: 'Confirm network leave? (Cannot be undone without a backup.)' })

        if (!confirmed) {
            logger.info(`Network leave cancelled.`)
            return false
        }

        const initStatus = await emberNetworkInit(this, ezsp)

        if (initStatus === EmberStatus.NOT_JOINED) {
            logger.info(`No network present.`)
            return true
        }

        if (initStatus !== EmberStatus.SUCCESS) {
            logger.error(`Failed network init request with status=${EmberStatus[initStatus]}.`)
            return true
        }

        await waitForStackStatus(this, ezsp, EmberStatus.NETWORK_UP)

        const leaveStatus = await ezsp.ezspLeaveNetwork()

        if (leaveStatus !== EmberStatus.SUCCESS) {
            logger.error(`Failed to leave network with status=${EmberStatus[leaveStatus]}.`)
            return true
        }

        await waitForStackStatus(this, ezsp, EmberStatus.NETWORK_DOWN)

        logger.info(`Left network.`)

        return true
    }

    private async menuNetworkRestore(ezsp: Ezsp): Promise<boolean> {
        const backupFile = await this.browseToFile('Network backup file location', DEFAULT_NETWORK_BACKUP_PATH, true)
        const backup = getBackup(this, backupFile)

        if (backup === undefined) {
            // error logged in getBackup
            return false
        }

        if (backup.devices.length > 0) {
            logger.error(`Restoring with App Link Keys currently not supported by CLI.`)
            return false
        }

        const radioTxPower = Number.parseInt(await input({
            default: '5',
            message: 'Initial radio transmit power [0-20]',
            validate(value: string) {
                if (/\./.test(value)) {
                    return false
                }

                const v = Number.parseInt(value, 10)
                return v >= 0 && v <= 20
            }
        }), 10)

        const initStatus = await emberNetworkInit(this, ezsp)
        const noNetwork = (initStatus === EmberStatus.NOT_JOINED)

        if (!noNetwork && initStatus !== EmberStatus.SUCCESS) {
            logger.error(`Failed network init request with status=${EmberStatus[initStatus]}.`)
            return true
        }

        if (!noNetwork) {
            const overwrite = await confirm({ default: false, message: 'A network is present in the adapter. Continue restoring?' })

            if (!overwrite) {
                logger.info(`Restore cancelled.`)
                return true
            }

            const leaveStatus = await ezsp.ezspLeaveNetwork()

            if (leaveStatus !== EmberStatus.SUCCESS) {
                logger.error(`Failed to leave network with status=${EmberStatus[leaveStatus]}.`)
                return true
            }

            await waitForStackStatus(this, ezsp, EmberStatus.NETWORK_DOWN)
        }

        const state: EmberInitialSecurityState = {
            bitmask: (
                EmberInitialSecurityBitmask.TRUST_CENTER_GLOBAL_LINK_KEY | EmberInitialSecurityBitmask.HAVE_PRECONFIGURED_KEY
                | EmberInitialSecurityBitmask.HAVE_NETWORK_KEY | EmberInitialSecurityBitmask.TRUST_CENTER_USES_HASHED_LINK_KEY
                | EmberInitialSecurityBitmask.REQUIRE_ENCRYPTED_KEY | EmberInitialSecurityBitmask.NO_FRAME_COUNTER_RESET
            ),
            networkKey: {contents: backup.networkOptions.networkKey},
            networkKeySequenceNumber: backup.networkKeyInfo.sequenceNumber,
            preconfiguredKey: {contents: backup.ezsp!.hashed_tclk!},// presence validated by getBackup()
            preconfiguredTrustCenterEui64: ZSpec.BLANK_EUI64,
        }

        let emberStatus = (await ezsp.ezspSetInitialSecurityState(state))

        if (emberStatus !== EmberStatus.SUCCESS) {
            logger.error(`Failed to set initial security state with status=${EmberStatus[emberStatus]}.`)
            return true
        }

        const extended: EmberExtendedSecurityBitmask = (
            EmberExtendedSecurityBitmask.JOINER_GLOBAL_LINK_KEY | EmberExtendedSecurityBitmask.NWK_LEAVE_REQUEST_NOT_ALLOWED
        )
        const extSecStatus = (await ezsp.ezspSetExtendedSecurityBitmask(extended))

        if (extSecStatus !== EzspStatus.SUCCESS) {
            logger.error(`Failed to set extended security bitmask to ${extended} with status=${EzspStatus[extSecStatus]}.`)
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

        emberStatus = (await ezsp.ezspFormNetwork(netParams))

        if (emberStatus !== EmberStatus.SUCCESS) {
            logger.error(`Failed form network request with status=${EmberStatus[emberStatus]}.`)
            return true
        }

        await waitForStackStatus(this, ezsp, EmberStatus.NETWORK_UP)

        const stStatus = await ezsp.ezspStartWritingStackTokens()

        logger.debug(`Start writing stack tokens status=${EzspStatus[stStatus]}.`)

        logger.info(`New network formed!`)

        const [status, , parameters] = await ezsp.ezspGetNetworkParameters()

        if (status !== EmberStatus.SUCCESS) {
            logger.error(`Failed to get network parameters with status=${EmberStatus[status]}.`)
            return true
        }

        if ((parameters.panId === backup.networkOptions.panId) && (Buffer.from(parameters.extendedPanId).equals(backup.networkOptions.extendedPanId))
            && (parameters.radioChannel === backup.logicalChannel)) {
            logger.info(`Restored network backup.`)
        } else {
            logger.error(`Failed to restore network backup.`)
        }

        return true// cleaner to exit after this
    }

    private async menuNetworkScan(ezsp: Ezsp): Promise<boolean> {
        const radioTxPower = Number.parseInt(await input({
            default: '5',
            message: 'Radio transmit power [0-20]',
            validate(value: string) {
                if (/\./.test(value)) {
                    return false
                }

                const v = Number.parseInt(value, 10)
                return v >= 0 && v <= 20
            }
        }), 10)

        const status = await ezsp.ezspSetRadioPower(radioTxPower)

        if (status !== EmberStatus.SUCCESS) {
            logger.error(`Failed to set transmit power to ${radioTxPower} status=${EmberStatus[status]}.`)
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

        const progressBar = new SingleBar(
            { clearOnComplete: true, format: '{bar} {percentage}% | ETA: {eta}s' },
            Presets.shades_classic
        )

        // a symbol is 16 microseconds, a scan period is 960 symbols
        const totalTime = ((((2 ** duration) + 1) * (16 * 960)) / 1000) * ZSpec.ALL_802_15_4_CHANNELS.length

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
            reportedValues.push(`Channel ${channel}: ${BULLET_FULL.repeat(full)}${BULLET_EMPTY.repeat(empty)} [${maxRssiValue} dBm]`)
        }

        ezsp.ezspNetworkFoundHandler = (networkFound: EmberZigbeeNetwork, lastHopLqi: number, lastHopRssi: number): void => {
            // eslint-disable-next-line perfectionist/sort-objects
            logger.debug(`ezspNetworkFoundHandler: ${JSON.stringify({ networkFound, lastHopLqi, lastHopRssi })}`)
            reportedValues.push(`Found network: PAN ID: ${networkFound.panId}, channel: ${networkFound.channel}, Node RSSI: ${lastHopRssi} dBm, LQI: ${lastHopLqi}.`)
        }

        ezsp.ezspScanCompleteHandler = (channel: number, status: EmberStatus): void => {
            logger.debug(`ezspScanCompleteHandler: ${JSON.stringify({ channel, status })}`)
            progressBar.stop()
            clearInterval(progressInterval)

            if (status === EmberStatus.SUCCESS) {
                scanCompleted && scanCompleted()
            } else {
                logger.error(`Failed to scan ${channel} with status=${EmberStatus[status]}.`)
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

        await new Promise<void>((resolve) => { scanCompleted = resolve })

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
        const repairId = await select<RepairId>({
            choices: [
                { name: 'Check for EUI64 mismatch', value: RepairId.EUI64_MISMATCH },
            ],
            message: 'Repair',
        })

        switch (repairId) {
            case RepairId.EUI64_MISMATCH: {
                const initStatus = await emberNetworkInit(this, ezsp)

                if (initStatus === EmberStatus.NOT_JOINED) {
                    logger.info(`No network present.`)
                    return true
                }

                if (initStatus !== EmberStatus.SUCCESS) {
                    logger.error(`Failed network init request with status=${EmberStatus[initStatus]}.`)
                    return true
                }

                const [status, securityState] = await ezsp.ezspGetCurrentSecurityState()

                if (status !== EmberStatus.SUCCESS) {
                    logger.error(`Failed get current security state request with status=${EmberStatus[status]}.`)
                    return true
                }

                const eui64 = await ezsp.ezspGetEui64()

                logger.info(`Node EUI64 ${eui64} / Trust Center EUI64 ${securityState.trustCenterLongAddress}.`)

                if (securityState.trustCenterLongAddress === eui64) {
                    logger.info(`EUI64 match. No fix required.`)
                    return true
                }

                logger.warning(`Fixing EUI64 mismatch...`)

                const [gtkStatus, tokenData] = await ezsp.ezspGetTokenData(NVM3KEY_STACK_TRUST_CENTER, 0)

                if (gtkStatus !== EmberStatus.SUCCESS) {
                    logger.error(`Failed get token data request with status=${EmberStatus[gtkStatus]}.`)
                    return true
                }

                const tokenEUI64 = tokenData.data.subarray(2, 10)
                const tcEUI64 = Buffer.from(securityState.trustCenterLongAddress.slice(2/* 0x */), 'hex').reverse()

                if (tokenEUI64.equals(tcEUI64)) {
                    tokenData.data.set(Buffer.from(eui64.slice(2/* 0x */), 'hex').reverse(), 2/* skip uint16_t at start */)

                    const stkStatus = await ezsp.ezspSetTokenData(NVM3KEY_STACK_TRUST_CENTER, 0, tokenData)

                    if (stkStatus !== EmberStatus.SUCCESS) {
                        logger.error(`Failed set token data request with status=${EmberStatus[stkStatus]}.`)
                        return true
                    }
                } else {
                    logger.error(`Failed to fix EUI64 mismatch. NVM3 Trust Center token doesn't match current security state.`)
                    return true
                }

                break
            }
        }

        return true
    }

    private async menuSecurityInfo(ezsp: Ezsp): Promise<boolean> {
        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.TC_LINK
            const [key, status] = (await ezsp.ezspExportKey(context))

            if (status === SLStatus.OK) {
                logger.info(`Trust Center Link Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export Trust Center Link Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.APP_LINK
            const [key, status] = (await ezsp.ezspExportKey(context))

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
            const [key, status] = (await ezsp.ezspExportKey(context))

            if (status === SLStatus.OK) {
                logger.info(`Network Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export Network Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.ZLL_ENCRYPTION_KEY
            const [key, status] = (await ezsp.ezspExportKey(context))

            if (status === SLStatus.OK) {
                logger.info(`ZLL Encryption Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export ZLL Encryption Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.ZLL_PRECONFIGURED_KEY
            const [key, status] = (await ezsp.ezspExportKey(context))

            if (status === SLStatus.OK) {
                logger.info(`ZLL Preconfigured Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export ZLL Preconfigured Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.GREEN_POWER_PROXY_TABLE_KEY
            const [key, status] = (await ezsp.ezspExportKey(context))

            if (status === SLStatus.OK) {
                logger.info(`Green Power Proxy Table Key: ${key.contents.toString('hex')}`)
            } else if (status !== SLStatus.NOT_FOUND) {
                logger.error(`Failed to export Green Power Proxy Table Key with status=${SLStatus[status]}.`)
            }
        }

        {
            const context: SecManContext = initSecurityManagerContext()
            context.coreKeyType = SecManKeyType.GREEN_POWER_SINK_TABLE_KEY
            const [key, status] = (await ezsp.ezspExportKey(context))

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
            saveFile = await this.browseToFile('Config save location (JSON)', DEFAULT_STACK_CONFIG_PATH)
        }

        const stackConfig = await getStackConfig(this, ezsp)

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
        const saveFile = await this.browseToFile('Tokens backup save file', DEFAULT_TOKENS_BACKUP_PATH)
        const eui64 = await ezsp.ezspGetEui64()
        const tokensBuf = await EmberTokensManager.saveTokens(
            ezsp,
            Buffer.from(eui64.slice(2/* 0x */), 'hex').reverse()
        )

        if (tokensBuf === null) {
            logger.error(`Failed to backup tokens.`)
        } else {
            writeFileSync(saveFile, tokensBuf.toString('hex'), 'utf8')

            logger.info(`Tokens backup written to '${saveFile}'.`)
        }

        return false
    }

    private async menuTokensReset(ezsp: Ezsp): Promise<boolean> {
        const confirmed = await confirm({ default: false, message: 'Confirm tokens reset? (Cannot be undone without a backup.)' })

        if (!confirmed) {
            logger.info(`Tokens reset cancelled.`)
            return false
        }

        const options = await checkbox({
            choices: [
                { checked: false, name: 'Exclude network and APS outgoing frame counter tokens?', value: 'excludeOutgoingFC' },
                { checked: false, name: 'Exclude stack boot counter token?', value: 'excludeBootCounter' },
            ],
            message: 'Reset options'
        })

        await ezsp.ezspTokenFactoryReset(options.includes('excludeOutgoingFC'), options.includes('excludeBootCounter'))

        return true
    }

    private async menuTokensRestore(ezsp: Ezsp): Promise<boolean> {
        const backupFile = await this.browseToFile('Tokens backup file location', DEFAULT_TOKENS_BACKUP_PATH, true)
        const tokensBuf = Buffer.from(readFileSync(backupFile, 'utf8'), 'hex')
        const status = await EmberTokensManager.restoreTokens(ezsp, tokensBuf)

        if (status === EmberStatus.SUCCESS) {
            logger.info(`Restored tokens backup.`)
        } else {
            logger.error(`Failed to restore tokens.`)
        }

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
                { name: 'Backup tokens (NVM3)', value: StackMenu.TOKENS_BACKUP },
                { name: 'Restore tokens (NVM3)', value: StackMenu.TOKENS_RESTORE },
                { name: 'Reset tokens (NVM3)', value: StackMenu.TOKENS_RESET },
                { name: 'Get security info', value: StackMenu.SECURITY_INFO },
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

            case StackMenu.SECURITY_INFO: {
                return this.menuSecurityInfo(ezsp)
            }

            case StackMenu.REPAIRS: {
                return this.menuRepairs(ezsp)
            }
        }

        return true// exit
    }
}
