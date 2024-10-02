import { readFileSync } from 'node:fs'

import { select } from '@inquirer/prompts'
import { Command } from '@oclif/core'

import { DEFAULT_TOKENS_BACKUP_PATH, logger } from '../../index.js'
import { parseTokenData } from '../../utils/ember.js'
import { NVM3ObjectKey } from '../../utils/enums.js'
import { browseToFile } from '../../utils/utils.js'

const enum UtilsMenu {
    PARSE_TOKENS_BACKUP_FILE = 10,
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

    private async navigateMenu(): Promise<boolean> {
        const answer = await select<-1 | UtilsMenu>({
            choices: [
                { name: 'Parse NVM3 tokens backup file', value: UtilsMenu.PARSE_TOKENS_BACKUP_FILE },
                { name: 'Exit', value: -1 },
            ],
            message: 'Menu',
        })

        switch (answer) {
            case UtilsMenu.PARSE_TOKENS_BACKUP_FILE: {
                return this.menuParseTokensBackupFile()
            }
        }

        return true // exit
    }
}
