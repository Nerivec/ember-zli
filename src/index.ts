import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { config, createLogger, format, transports } from 'winston'
import { setLogger as zhSetLogger } from 'zigbee-herdsman'

export const DATA_FOLDER = join(homedir(), 'ember-zli')

export const CONF_PORT_PATH = join(DATA_FOLDER, 'conf_port.json')
export const CONF_NETWORK_PATH = join(DATA_FOLDER, 'conf_network.json')

export const DEFAULT_STACK_CONFIG_PATH = join(DATA_FOLDER, 'stack_config.json')
export const DEFAULT_NETWORK_BACKUP_PATH = join(DATA_FOLDER, 'coordinator_backup.json')
export const DEFAULT_TOKENS_BACKUP_PATH = join(DATA_FOLDER, 'tokens_backup.nvm3')
export const DEFAULT_TOKENS_INFO_PATH = join(DATA_FOLDER, 'tokens_info.json')

if (!existsSync(DATA_FOLDER)) {
    mkdirSync(DATA_FOLDER)
}

export const logger = createLogger({
    format: format.combine(
        format.errors({ stack: true }),
        format.timestamp(), // new Date().toISOString()
        format.printf((info) => `[${info.timestamp}] ${info.level}:\t${info.namespace ?? 'cli'}: ${info.message}`),
    ),
    levels: config.syslog.levels,
    transports: [
        new transports.Console({
            format: format.colorize({ all: true, colors: { debug: 'blue', error: 'red', info: 'green', warning: 'yellow' } }),
            level: 'info',
        }),
        new transports.File({
            filename: join(DATA_FOLDER, `ember-zli-${Date.now()}.log`),
            level: 'debug',
        }),
    ],
})

zhSetLogger({
    debug(message, namespace) {
        logger.debug(`${message}`, { namespace })
    },
    error(message, namespace) {
        logger.error(`${message}`, { namespace })
    },
    info(message, namespace) {
        logger.info(`${message}`, { namespace })
    },
    warning(message, namespace) {
        logger.warn(`${message}`, { namespace })
    },
})

logger.info(`Data folder: ${DATA_FOLDER}.`)

export { run } from '@oclif/core'
