import { input, select } from '@inquirer/prompts'
import { readFileSync, writeFileSync } from 'node:fs'
import { SerialPort } from 'zigbee-herdsman/dist/adapter/serialPort.js'

import { CONF_PORT_PATH, logger } from '../index.js'
import { BAUDRATES, TCP_REGEX } from './consts.js'
import { BaudRate, PortConf, PortType } from './types.js'

export const getPortConf = async(useFile: boolean = true): Promise<PortConf> => {
    if (useFile) {
        try {
            const conf = readFileSync(CONF_PORT_PATH, 'utf8')

            return JSON.parse(conf)
        } catch {}
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
                // @ts-expect-error friendlyName windows only
                choices: portList.map((p) => ({ name: `${p.manufacturer} ${p.friendlyName ?? ''} ${p.pnpId} (${p.path})`, value: p.path })),
                message: 'Serial port',
            })

            const fcChoices = [
                { name: 'Software Flow Control (rtscts=false)', value: false },
                { name: 'Hardware Flow Control (rtscts=true)', value: true },
            ]
            rtscts = await select<boolean>({
                choices: fcChoices,
                message: 'Flow control'
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

    const conf = {baudRate, path, rtscts}

    try {
        writeFileSync(CONF_PORT_PATH, JSON.stringify(conf, null, 2), 'utf8')
    } catch {
        logger.error(`Could not write port conf to ${CONF_PORT_PATH}.`)
    }

    return conf
}