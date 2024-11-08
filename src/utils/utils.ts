import type { SelectChoices } from './types.js'

import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'

import { input, select } from '@inquirer/prompts'

import { DEFAULT_STACK_CONFIG } from 'zigbee-herdsman/dist/adapter/ember/adapter/emberAdapter.js'
import { IEEE802154CcaMode } from 'zigbee-herdsman/dist/adapter/ember/enums.js'
import { halCommonCrc16, highByte, lowByte } from 'zigbee-herdsman/dist/adapter/ember/utils/math.js'
import { UnifiedBackupStorage } from 'zigbee-herdsman/dist/models/backup-storage-unified.js'
import { Backup } from 'zigbee-herdsman/dist/models/backup.js'
import { fromUnifiedBackup } from 'zigbee-herdsman/dist/utils/backup.js'

import { CONF_STACK, DATA_FOLDER, logger } from '../index.js'

// @from zigbee2mqtt-frontend
export const toHex = (input: number, padding = 4): string => {
    const padStr = '0'.repeat(padding)
    return '0x' + (padStr + input.toString(16)).slice(-1 * padding).toUpperCase()
}

export const loadStackConfig = (): typeof DEFAULT_STACK_CONFIG => {
    try {
        const customConfig = JSON.parse(readFileSync(CONF_STACK, 'utf8'))
        // set any undefined config to default
        const config = { ...DEFAULT_STACK_CONFIG, ...customConfig }

        const inRange = (value: number, min: number, max: number): boolean => !(value == undefined || value < min || value > max)

        if (!['high', 'low'].includes(config.CONCENTRATOR_RAM_TYPE)) {
            config.CONCENTRATOR_RAM_TYPE = DEFAULT_STACK_CONFIG.CONCENTRATOR_RAM_TYPE
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_RAM_TYPE, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_MIN_TIME, 1, 60) || config.CONCENTRATOR_MIN_TIME >= config.CONCENTRATOR_MAX_TIME) {
            config.CONCENTRATOR_MIN_TIME = DEFAULT_STACK_CONFIG.CONCENTRATOR_MIN_TIME
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_MIN_TIME, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_MAX_TIME, 30, 300) || config.CONCENTRATOR_MAX_TIME <= config.CONCENTRATOR_MIN_TIME) {
            config.CONCENTRATOR_MAX_TIME = DEFAULT_STACK_CONFIG.CONCENTRATOR_MAX_TIME
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_MAX_TIME, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_ROUTE_ERROR_THRESHOLD, 1, 100)) {
            config.CONCENTRATOR_ROUTE_ERROR_THRESHOLD = DEFAULT_STACK_CONFIG.CONCENTRATOR_ROUTE_ERROR_THRESHOLD
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_ROUTE_ERROR_THRESHOLD, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD, 1, 100)) {
            config.CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD = DEFAULT_STACK_CONFIG.CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_DELIVERY_FAILURE_THRESHOLD, using default.`)
        }

        if (!inRange(config.CONCENTRATOR_MAX_HOPS, 0, 30)) {
            config.CONCENTRATOR_MAX_HOPS = DEFAULT_STACK_CONFIG.CONCENTRATOR_MAX_HOPS
            logger.error(`[CONF STACK] Invalid CONCENTRATOR_MAX_HOPS, using default.`)
        }

        if (!inRange(config.MAX_END_DEVICE_CHILDREN, 6, 64)) {
            config.MAX_END_DEVICE_CHILDREN = DEFAULT_STACK_CONFIG.MAX_END_DEVICE_CHILDREN
            logger.error(`[CONF STACK] Invalid MAX_END_DEVICE_CHILDREN, using default.`)
        }

        if (!inRange(config.TRANSIENT_DEVICE_TIMEOUT, 0, 65535)) {
            config.TRANSIENT_DEVICE_TIMEOUT = DEFAULT_STACK_CONFIG.TRANSIENT_DEVICE_TIMEOUT
            logger.error(`[CONF STACK] Invalid TRANSIENT_DEVICE_TIMEOUT, using default.`)
        }

        if (!inRange(config.END_DEVICE_POLL_TIMEOUT, 0, 14)) {
            config.END_DEVICE_POLL_TIMEOUT = DEFAULT_STACK_CONFIG.END_DEVICE_POLL_TIMEOUT
            logger.error(`[CONF STACK] Invalid END_DEVICE_POLL_TIMEOUT, using default.`)
        }

        if (!inRange(config.TRANSIENT_KEY_TIMEOUT_S, 0, 65535)) {
            config.TRANSIENT_KEY_TIMEOUT_S = DEFAULT_STACK_CONFIG.TRANSIENT_KEY_TIMEOUT_S
            logger.error(`[CONF STACK] Invalid TRANSIENT_KEY_TIMEOUT_S, using default.`)
        }

        config.CCA_MODE = config.CCA_MODE ?? undefined // always default to undefined

        if (config.CCA_MODE && IEEE802154CcaMode[config.CCA_MODE] === undefined) {
            config.CCA_MODE = undefined
            logger.error(`[STACK CONFIG] Invalid CCA_MODE, ignoring.`)
        }

        logger.info(`Using stack config ${JSON.stringify(config)}.`)

        return config
    } catch {
        /* empty */
    }

    logger.info(`Using default stack config.`)

    return DEFAULT_STACK_CONFIG
}

export const browseToFile = async (message: string, defaultValue: string, toWrite: boolean = false): Promise<string> => {
    const pathOpt = await select<number>({
        choices: [
            { name: `Use default (${defaultValue})`, value: 0 },
            { name: `Enter path manually`, value: 1 },
            { name: `Select in data folder (${DATA_FOLDER})`, value: 2 },
        ],
        message,
    })
    let filepath: string = defaultValue

    switch (pathOpt) {
        case 1: {
            filepath = await input({
                message: 'Enter path to file',
                validate(value) {
                    return existsSync(dirname(value)) && extname(value) === extname(defaultValue)
                },
            })

            break
        }

        case 2: {
            const files = readdirSync(DATA_FOLDER)
            const fileChoices: SelectChoices<string> = [{ name: `Go back`, value: '-1' }]

            for (const file of files) {
                if (extname(file) === extname(defaultValue)) {
                    const { size, mtime, birthtime } = statSync(join(DATA_FOLDER, file))

                    fileChoices.push({
                        name: file,
                        value: file,
                        description: `Size: ${size} bytes | Created: ${birthtime.toISOString()} | Last Modified: ${mtime.toISOString()}`,
                    })
                }
            }

            let chosenFile = '-1'

            if (fileChoices.length === 1) {
                logger.error(`Found no file in '${DATA_FOLDER}'.`)
            } else {
                chosenFile = await select<string>({ choices: fileChoices, message })
            }

            filepath = chosenFile === '-1' ? await browseToFile(message, defaultValue, toWrite) : join(DATA_FOLDER, chosenFile)

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

        if (data.metadata.format === 'zigpy/open-coordinator-backup') {
            if (data.metadata.version !== 1) {
                logger.error(`Unsupported open coordinator backup version (version=${data.metadata.version}).`)
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

export const computeCRC16 = (data: Buffer, init: number = 0): Buffer => {
    let crc = init

    for (const byte of data) {
        crc = halCommonCrc16(byte, crc)
    }

    return Buffer.from([highByte(crc), lowByte(crc)])
}

export const computeCRC16CITTKermit = (data: Buffer, init: number = 0): Buffer => {
    let crc = init

    for (const byte of data) {
        let t = crc ^ byte
        t = (t ^ (t << 4)) & 0xff
        crc = (crc >> 8) ^ (t << 8) ^ (t >> 4) ^ (t << 3)
    }

    return Buffer.from([lowByte(crc), highByte(crc)])
}

export async function fetchJson<T>(pageUrl: string): Promise<T> {
    const response = await fetch(pageUrl)

    if (!response.ok || !response.body) {
        throw new Error(`Invalid response from ${pageUrl} status=${response.status}.`)
    }

    return (await response.json()) as T
}
