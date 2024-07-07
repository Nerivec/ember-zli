import { input, select } from '@inquirer/prompts'
import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { Backup } from 'zigbee-herdsman/dist/models/backup.js'
import { UnifiedBackupStorage } from 'zigbee-herdsman/dist/models/backup-storage-unified.js'
import { fromUnifiedBackup } from 'zigbee-herdsman/dist/utils/backup.js'

import { CONF_STACK, DATA_FOLDER, logger } from '../index.js'
import { DEFAULT_CONF_STACK } from './consts.js'
import { StackConfig } from './types.js'

// @from zigbee2mqtt-frontend
export const toHex = (input: number, padding = 4): string => {
    const padStr = '0'.repeat(padding)
    return '0x' + (padStr + input.toString(16)).slice(-1 * padding).toUpperCase()
}

export const loadStackConfig = (): StackConfig => {
    try {
        const customConfig: StackConfig = JSON.parse(readFileSync(CONF_STACK, 'utf8'))
        // set any undefined config to default
        const config: StackConfig = { ...DEFAULT_CONF_STACK, ...customConfig }

        const inRange = (value: number, min: number, max: number): boolean => !(value === null || value < min || value > max)

        if (!['high', 'low'].includes(config.CONCENTRATOR_RAM_TYPE)) {
            config.CONCENTRATOR_RAM_TYPE = DEFAULT_CONF_STACK.CONCENTRATOR_RAM_TYPE
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_RAM_TYPE, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_MIN_TIME, 1, 60) || config.CONCENTRATOR_MIN_TIME >= config.CONCENTRATOR_MAX_TIME) {
            config.CONCENTRATOR_MIN_TIME = DEFAULT_CONF_STACK.CONCENTRATOR_MIN_TIME
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_MIN_TIME, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_MAX_TIME, 30, 300) || config.CONCENTRATOR_MAX_TIME <= config.CONCENTRATOR_MIN_TIME) {
            config.CONCENTRATOR_MAX_TIME = DEFAULT_CONF_STACK.CONCENTRATOR_MAX_TIME
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_MAX_TIME, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_ROUTE_ERROR_THRESHOLD, 1, 100)) {
            config.CONCENTRATOR_ROUTE_ERROR_THRESHOLD = DEFAULT_CONF_STACK.CONCENTRATOR_ROUTE_ERROR_THRESHOLD
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_ROUTE_ERROR_THRESHOLD, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD, 1, 100)) {
            config.CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD = DEFAULT_CONF_STACK.CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_MAX_HOPS, 0, 30)) {
            config.CONCENTRATOR_MAX_HOPS = DEFAULT_CONF_STACK.CONCENTRATOR_MAX_HOPS
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_MAX_HOPS, using default.`)
        }

        if (!inRange(config.MAX_END_DEVICE_CHILDREN, 6, 64)) {
            config.MAX_END_DEVICE_CHILDREN = DEFAULT_CONF_STACK.MAX_END_DEVICE_CHILDREN
            logger.error(`[CONF STACK] Invalid MAX_END_DEVICE_CHILDREN, using default.`)
        }

        if (!inRange(config.TRANSIENT_DEVICE_TIMEOUT, 0, 65535)) {
            config.TRANSIENT_DEVICE_TIMEOUT = DEFAULT_CONF_STACK.TRANSIENT_DEVICE_TIMEOUT
            logger.error(`[CONF STACK] Invalid TRANSIENT_DEVICE_TIMEOUT, using default.`)
        }

        if (!inRange(config.END_DEVICE_POLL_TIMEOUT, 0, 14)) {
            config.END_DEVICE_POLL_TIMEOUT = DEFAULT_CONF_STACK.END_DEVICE_POLL_TIMEOUT
            logger.error(`[CONF STACK] Invalid END_DEVICE_POLL_TIMEOUT, using default.`)
        }

        if (!inRange(config.TRANSIENT_KEY_TIMEOUT_S, 0, 65535)) {
            config.TRANSIENT_KEY_TIMEOUT_S = DEFAULT_CONF_STACK.TRANSIENT_KEY_TIMEOUT_S
            logger.error(`[CONF STACK] Invalid TRANSIENT_KEY_TIMEOUT_S, using default.`)
        }

        logger.info(`Using stack config ${JSON.stringify(config)}.`)

        return config
    } catch {}

    logger.info(`Using default stack config.`)

    return DEFAULT_CONF_STACK
}

export const browseToFile = async (message: string, defaultValue: string, toWrite: boolean = false): Promise<string> => {
    const choices: { name: string; value: number }[] = [
        { name: `Use default (${defaultValue})`, value: 0 },
        { name: `Enter path manually`, value: 1 },
        { name: `Select in data folder (${DATA_FOLDER})`, value: 2 },
    ]

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

            filepath = join(
                DATA_FOLDER,
                await select<string>({
                    choices: fileChoices,
                    message,
                }),
            )

            break
        }
    }

    if (toWrite && existsSync(filepath)) {
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
