import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { select } from '@inquirer/prompts'
import { Command } from '@oclif/core'

import { DEFAULT_TOKENS_BACKUP_PATH, logger, LOGS_FOLDER } from '../../index.js'
import { parseTokenData } from '../../utils/ember.js'
import { NVM3ObjectKey } from '../../utils/enums.js'
import { browseToFile } from '../../utils/utils.js'

const enum UtilsMenu {
    PARSE_TOKENS_BACKUP_FILE = 10,
    PURGE_LOG_FILES = 90,
}

export default class Utils extends Command {
    static override args = {}
    static override description = 'Execute various utility commands.'
    static override examples = ['<%= config.bin %> <%= command.id %>']
    static override flags = {}

    public async run(): Promise<void> {
        // const {args, flags} = await this.parse(Utils)
        let exit: boolean = false

        while (!exit) {
            exit = await this.navigateMenu()
        }

        return this.exit(0)
    }

    private async menuParseTokensBackupFile(): Promise<boolean> {
        const backupFile = await browseToFile('Tokens backup file location', DEFAULT_TOKENS_BACKUP_PATH)
        const tokensBuf = Buffer.from(readFileSync(backupFile, 'utf8'), 'hex')

        if (tokensBuf.length === 0) {
            logger.error(`Tokens file invalid or empty.`)

            return true
        }

        let readOffset: number = 0
        const inTokenCount = tokensBuf.readUInt8(readOffset++)

        for (let i = 0; i < inTokenCount; i++) {
            const nvm3Key = tokensBuf.readUInt32LE(readOffset) // 4 bytes Token Key/Creator
            readOffset += 4
            const size = tokensBuf.readUInt8(readOffset++) // 1 byte token size
            const arraySize = tokensBuf.readUInt8(readOffset++) // 1 byte array size.

            for (let arrayIndex = 0; arrayIndex < arraySize; arrayIndex++) {
                const parsedTokenData = parseTokenData(nvm3Key, tokensBuf.subarray(readOffset, readOffset + size))

                logger.info(`Token nvm3Key=${NVM3ObjectKey[nvm3Key]} size=${size} token=[${parsedTokenData}]`)

                readOffset += size
            }
        }

        return false
    }

    private async menuPurgeLogFiles(): Promise<boolean> {
        const olderThan = await select<number>({
            choices: [
                { name: 'Older than 30 days', value: 3600000 * 24 * 30 },
                { name: 'Older than 7 days', value: 3600000 * 24 * 7 },
                { name: 'Older than 1 day', value: 3600000 * 24 },
                { name: 'Older than 1 hour', value: 3600000 },
                { name: 'All', value: -1 },
            ],
            message: 'Timeframe',
        })

        let count = 0

        // -1 == never process last (currently used)
        for (const file of readdirSync(LOGS_FOLDER).slice(0, -1)) {
            const match = file.match(/^ember-zli-(\d+)\.log$/)

            if (match) {
                if (olderThan === -1 || parseInt(match[1], 10) < Date.now() - olderThan) {
                    rmSync(join(LOGS_FOLDER, file), { force: true })

                    count++
                }
            }
        }

        logger.info(`Purged ${count} log files.`)

        return false
    }

    private async navigateMenu(): Promise<boolean> {
        const answer = await select<-1 | UtilsMenu>({
            choices: [
                { name: 'Parse NVM3 tokens backup file', value: UtilsMenu.PARSE_TOKENS_BACKUP_FILE },
                { name: 'Purge log files', value: UtilsMenu.PURGE_LOG_FILES },
                { name: 'Exit', value: -1 },
            ],
            message: 'Menu',
        })

        switch (answer) {
            case UtilsMenu.PARSE_TOKENS_BACKUP_FILE: {
                return this.menuParseTokensBackupFile()
            }

            case UtilsMenu.PURGE_LOG_FILES: {
                return this.menuPurgeLogFiles()
            }
        }

        return true // exit
    }
}
