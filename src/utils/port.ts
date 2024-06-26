import { confirm, input, select } from '@inquirer/prompts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { SerialPort } from 'zigbee-herdsman/dist/adapter/serialPort.js'

import { CONF_PORT_PATH, logger } from '../index.js'
import { BAUDRATES, TCP_REGEX } from './consts.js'
import { BaudRate, PortConf, PortType } from './types.js'

export const parseTcpPath = (path: string): {host: string; port: number} => {
    const str = path.replace("tcp://", "")

    return {
        host: str.slice(0, Math.max(0, str.indexOf(":"))),
        port: Number(str.slice(Math.max(0, str.indexOf(":") + 1))),
    }
}

export const getPortConfFile = async (): Promise<PortConf | undefined> => {
    if (!existsSync(CONF_PORT_PATH)) {
        return undefined
    }

    const file = readFileSync(CONF_PORT_PATH, 'utf8')
    const conf: PortConf = JSON.parse(file)

    if (!conf.baudRate || !BAUDRATES.includes(conf.baudRate)) {
        logger.error(`Cached config does not include a valid baudrate value.`)
        return undefined
    }

    if (!conf.path) {
        logger.error(`Cached config does not include a valid path value.`)
        return undefined
    }

    if (!TCP_REGEX.test(conf.path)) {
        const portList = await SerialPort.list()

        if (portList.length === 0) {
            logger.error('Cached config is using serial, no serial device currently connected.')
            return undefined
        }

        if (!portList.some((p) => p.path === conf.path)) {
            logger.error(`Cached config path does not match a currently connected serial device.`)
            return undefined
        }
    }

    if (conf.rtscts !== true && conf.rtscts !== false) {
        logger.error(`Cached config does not include a valid rtscts value.`)
        return undefined
    }

    return conf
}

export const getPortConf = async (): Promise<PortConf> => {
    const portConfFile = await getPortConfFile()

    if (portConfFile !== undefined) {
        const usePortConfFile = await confirm({
            default: true,
            message: `Baudrate: ${portConfFile.baudRate}, Path: ${portConfFile.path}, RTS/CTS: ${portConfFile.rtscts}. Use this config?`,
        })

        if (usePortConfFile) {
            return portConfFile
        }
    }

    const baudrateChoices = []

    for (const v of BAUDRATES) {
        baudrateChoices.push({ name: v.toString(), value: v })
    }

    const baudRate = await select<BaudRate>({
        choices: baudrateChoices,
        message: 'Adapter firmware baudrate',
    })

    const type = await select<PortType>({
        choices: [
            { name: 'Serial', value: 'serial' },
            { name: 'TCP', value: 'tcp' },
        ],
        message: 'Adapter connection type',
    })

    let path = null
    let rtscts = false

    switch (type) {
        case 'serial': {
            const portList = await SerialPort.list()

            if (portList.length === 0) {
                throw new Error('No serial device found.')
            }

            path = await select<string>({
                choices: portList.map((p) => ({
                    // @ts-expect-error friendlyName windows only
                    name: `${p.manufacturer} ${p.friendlyName ?? ''} ${p.pnpId} (${p.path})`,
                    value: p.path,
                })),
                message: 'Serial port',
            })

            const fcChoices = [
                { name: 'Software Flow Control (rtscts=false)', value: false },
                { name: 'Hardware Flow Control (rtscts=true)', value: true },
            ]
            rtscts = await select<boolean>({
                choices: fcChoices,
                message: 'Flow control',
            })
            break
        }

        case 'tcp': {
            path = await input({
                message: 'TCP path',
                validate: (s) => TCP_REGEX.test(s),
            })
            break
        }
    }

    if (!path) {
        throw new Error('Invalid port path.')
    }

    const conf = { baudRate, path, rtscts }

    try {
        writeFileSync(CONF_PORT_PATH, JSON.stringify(conf, null, 2), 'utf8')
    } catch {
        logger.error(`Could not write port conf to ${CONF_PORT_PATH}.`)
    }

    return conf
}
