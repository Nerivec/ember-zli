import { Command } from '@oclif/core'

import { logger } from '../../index.js'
import { getPortConf } from '../../utils/port.js'
import { Transport, TransportEvent } from '../../utils/transport.js'

export default class Monitor extends Command {
    static override args = {}
    static override description = 'Monitor the chosen port in the console.'
    static override examples = ['<%= config.bin %> <%= command.id %>']

    public async run(): Promise<void> {
        const portConf = await getPortConf()
        logger.debug(`Using port conf: ${JSON.stringify(portConf)}`)

        const transport = new Transport(portConf)

        try {
            await transport.initPort()
        } catch (error) {
            logger.error(`Failed to open port: ${error}.`)

            await transport.close(false, false) // force failed below

            return this.exit(1)
        }

        logger.info(`Started monitoring. Press any key to stop.`)

        transport.on(TransportEvent.FAILED, () => this.exit(1))
        transport.on(TransportEvent.DATA, (data) => process.stdout.write(data))

        process.stdin.setRawMode(true)
        process.stdin.resume()

        await new Promise<void>((resolve) => {
            process.stdin.once('data', () => {
                process.stdin.setRawMode(false)
                resolve()
            })
        })

        return this.exit(0)
    }
}
