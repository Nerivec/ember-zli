import EventEmitter from "node:events";

import { logger } from "../index.js";
import { computeCRC16 } from "./utils.js";

const NS = { namespace: "xmodemcrc" };
const FILLER = 0xff;

/** First block number. */
const XMODEM_START_BLOCK = 1;
/** Bytes in each block (header and checksum not included) */
const BLOCK_SIZE = 128;
/** Maximum retries to send block before giving up */
const MAX_RETRIES = 10;

export enum XSignal {
    /** Start of Header */
    SOH = 0x01,
    /** End of Transmission */
    EOT = 0x04,
    /** Acknowledge */
    ACK = 0x06,
    /** Not Acknowledge */
    NAK = 0x15,
    /** End of Transmission Block / File done */
    ETB = 0x17,
    /** Cancel */
    CAN = 0x18,
    /** Block OK */
    BOK = 0x19,
    /** 'C' */
    CRC = 0x43,
}

export enum XExitStatus {
    SUCCESS = 0,
    FAIL = 1,
    CANCEL = 2,
}

export enum XEvent {
    /** C byte received */
    START = "start",
    STOP = "stop",
    /** Data to write */
    DATA = "data",
}

interface XModemCRCEventMap {
    [XEvent.DATA]: [buffer: Buffer, progressPc: number];
    [XEvent.START]: [];
    [XEvent.STOP]: [status: XExitStatus];
}

export class XModemCRC extends EventEmitter<XModemCRCEventMap> {
    private blockNum: number = XMODEM_START_BLOCK;
    private blocks: Buffer[] = [];
    private retries: number = MAX_RETRIES;
    private sentEOF = false;
    private waitForBlock: number = XMODEM_START_BLOCK;

    public init(buffer: Buffer): void {
        this.blockNum = XMODEM_START_BLOCK;
        this.blocks = [Buffer.from([])]; // filler for start block offset
        this.retries = MAX_RETRIES;
        this.sentEOF = false;
        this.waitForBlock = XMODEM_START_BLOCK;
        let currentBlock = Buffer.alloc(BLOCK_SIZE);

        while (buffer.length > 0) {
            for (let i = 0; i < BLOCK_SIZE; i++) {
                currentBlock[i] = buffer[i] === undefined ? FILLER : buffer[i];
            }

            buffer = buffer.subarray(BLOCK_SIZE);
            this.blocks.push(currentBlock);
            currentBlock = Buffer.alloc(BLOCK_SIZE);
        }

        const blocksCount = this.blocks.length - XMODEM_START_BLOCK;

        logger.debug(`Outgoing blocks count=${blocksCount}, size=${blocksCount * BLOCK_SIZE}.`, NS);
    }

    public process(recdData: Buffer): void {
        if (this.waitForBlock !== this.blockNum) {
            logger.warning(
                `Received out of sequence data: ${recdData.toString("hex")} (blockNum=${this.blockNum}, expected=${this.waitForBlock}).`,
                NS,
            );
            this.retries--;

            if (this.retries === 0) {
                logger.error(`Maximum retries ${MAX_RETRIES} reached. Giving up.`, NS);
                this.emit(XEvent.STOP, XExitStatus.FAIL);
            }

            return;
        }

        logger.debug(`Current block ${this.blockNum}. Received data: ${recdData.toString("hex")}.`, NS);

        switch (recdData[0]) {
            case XSignal.CRC: {
                if (this.blockNum === XMODEM_START_BLOCK) {
                    logger.debug("Received C byte, starting transfer...", NS);

                    if (this.blocks.length > this.blockNum) {
                        this.emit(XEvent.START);
                        this.emitBlock(this.blockNum, this.blocks[this.blockNum]);

                        this.blockNum++;
                    }
                }

                break;
            }

            case XSignal.ACK: {
                if (this.blockNum > XMODEM_START_BLOCK) {
                    this.retries = MAX_RETRIES;

                    logger.debug("ACK received.", NS);

                    if (this.blocks.length > this.blockNum) {
                        this.emitBlock(this.blockNum, this.blocks[this.blockNum]);

                        this.blockNum++;
                    } else if (this.blocks.length === this.blockNum) {
                        if (this.sentEOF === false) {
                            this.sentEOF = true;

                            logger.debug("Sending End of Transmission.", NS);
                            this.emit(XEvent.DATA, Buffer.from([XSignal.EOT]), 100);
                        } else {
                            logger.debug("Done.", NS);
                            this.emit(XEvent.STOP, XExitStatus.SUCCESS);
                        }
                    }
                }

                break;
            }

            case XSignal.NAK: {
                if (this.blockNum > XMODEM_START_BLOCK) {
                    this.retries--;

                    logger.debug("NAK received.", NS);

                    if (this.retries === 0) {
                        logger.error(`Maximum retries ${MAX_RETRIES} reached. Giving up.`, NS);
                        this.emit(XEvent.STOP, XExitStatus.FAIL);
                    } else if (this.blockNum === this.blocks.length && this.sentEOF) {
                        logger.warning("Received NAK, resending EOT.", NS);
                        this.emit(XEvent.DATA, Buffer.from([XSignal.EOT]), 0);
                    } else {
                        logger.warning("Packet corrupted, resending previous block.", NS);

                        this.blockNum--;

                        if (this.blocks.length > this.blockNum) {
                            this.emitBlock(this.blockNum, this.blocks[this.blockNum]);

                            this.blockNum++;
                        }
                    }
                }

                break;
            }

            case XSignal.CAN: {
                logger.error("Received cancel.", NS);
                this.emit(XEvent.STOP, XExitStatus.CANCEL);

                break;
            }

            default: {
                logger.debug(`Unrecognized data received for block ${this.blockNum}. Ignoring.`, NS);

                break;
            }
        }
    }

    private emitBlock(blockNum: number, blockData: Buffer): void {
        const progressPc = Math.round((blockNum / (this.blocks.length - XMODEM_START_BLOCK)) * 100);
        this.waitForBlock = blockNum + 1;
        blockNum &= 0xff; // starts at 1, goes to 255, then wraps back to 0 (XModem spec)

        logger.debug(`Sending block ${blockNum}.`, NS);

        this.emit(
            XEvent.DATA,
            Buffer.concat([Buffer.from([XSignal.SOH, blockNum, 0xff - blockNum]), blockData, computeCRC16(blockData)]),
            progressPc,
        );
    }
}
