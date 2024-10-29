import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { config, createLogger, format, transports } from 'winston'

import { setLogger as zhSetLogger } from 'zigbee-herdsman'

export const DATA_FOLDER = join(homedir(), 'ember-zli')
export const LOGS_FOLDER = join(DATA_FOLDER, 'logs')

export const CONF_PORT_PATH = join(DATA_FOLDER, 'conf_port.json')
export const CONF_NETWORK_PATH = join(DATA_FOLDER, 'conf_network.json')
export const CONF_STACK = join(DATA_FOLDER, 'conf_stack.json')

export const DEFAULT_STACK_CONFIG_PATH = join(DATA_FOLDER, 'stack_config.json')
export const DEFAULT_NETWORK_BACKUP_PATH = join(DATA_FOLDER, 'coordinator_backup.json')
export const DEFAULT_TOKENS_BACKUP_PATH = join(DATA_FOLDER, 'tokens_backup.nvm3')
export const DEFAULT_ROUTER_TOKENS_BACKUP_PATH = join(DATA_FOLDER, 'router_tokens_backup.nvm3')
export const DEFAULT_CONFIGURATION_YAML_PATH = join(DATA_FOLDER, 'configuration.yaml')
export const DEFAULT_FIRMWARE_GBL_PATH = join(DATA_FOLDER, 'firmware.gbl')
export const DEFAULT_ROUTER_SCRIPT_MJS_PATH = join(DATA_FOLDER, 'router_script.mjs')

export const DEFAULT_PCAP_PATH = join(DATA_FOLDER, 'sniff.pcap')

if (!existsSync(DATA_FOLDER)) {
    mkdirSync(DATA_FOLDER)
}

if (!existsSync(LOGS_FOLDER)) {
    mkdirSync(LOGS_FOLDER)
}

export const logger = createLogger({
    format: format.combine(
        format.errors({ stack: true }),
        format.timestamp({
            format: new Date().toLocaleString('sv' /* uses ISO */, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) + '.SSS',
        }),
        format.printf((info) => `[${info.timestamp}] ${info.level}: \t${info.namespace ?? 'cli'}: ${info.message}`),
    ),
    levels: config.syslog.levels,
    transports: [
        new transports.Console({
            format: format.colorize({ all: true, colors: { debug: 'blue', error: 'red', info: 'green', warning: 'yellow' } }),
            level: 'info',
        }),
        new transports.File({
            filename: join(LOGS_FOLDER, `ember-zli-${Date.now()}.log`),
            level: 'debug',
        }),
    ],
})

const getZHMessage = (messageOrLambda: string | (() => string)): string => {
    return messageOrLambda instanceof Function ? messageOrLambda() : messageOrLambda
}

zhSetLogger({
    debug(message, namespace) {
        logger.debug(getZHMessage(message), { namespace })
    },
    error(message, namespace) {
        logger.error(getZHMessage(message), { namespace })
    },
    info(message, namespace) {
        logger.info(getZHMessage(message), { namespace })
    },
    warning(message, namespace) {
        logger.warning(getZHMessage(message), { namespace })
    },
})

logger.info(`Data folder: ${DATA_FOLDER}.`)

export { run } from '@oclif/core'
