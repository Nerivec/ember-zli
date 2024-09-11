import { EZSP_MAX_FRAME_LENGTH } from 'zigbee-herdsman/dist/adapter/ember/ezsp/consts.js'

/**
 * @see https://github.com/wireshark/wireshark/blob/master/epan/dissectors/packet-zep.c
 * @see https://github.com/wireshark/wireshark/blob/master/epan/dissectors/packet-ieee802154.c
 * @see https://github.com/wireshark/wireshark/blob/master/epan/dissectors/packet-zbee-nwk.c
 *------------------------------------------------------------
 *
 *      ZEP Packets must be received in the following format:
 *      |UDP Header|  ZEP Header |IEEE 802.15.4 Packet|
 *      | 8 bytes  | 16/32 bytes |    <= 127 bytes    |
 *------------------------------------------------------------
 *
 *      ZEP v1 Header will have the following format:
 *      |Preamble|Version|Channel ID|Device ID|CRC/LQI Mode|LQI Val|Reserved|Length|
 *      |2 bytes |1 byte |  1 byte  | 2 bytes |   1 byte   |1 byte |7 bytes |1 byte|
 *
 *      ZEP v2 Header will have the following format (if type=1/Data):
 *      |Preamble|Version| Type |Channel ID|Device ID|CRC/LQI Mode|LQI Val|NTP Timestamp|Sequence#|Reserved|Length|
 *      |2 bytes |1 byte |1 byte|  1 byte  | 2 bytes |   1 byte   |1 byte |   8 bytes   | 4 bytes |10 bytes|1 byte|
 *
 *      ZEP v2 Header will have the following format (if type=2/Ack):
 *      |Preamble|Version| Type |Sequence#|
 *      |2 bytes |1 byte |1 byte| 4 bytes |
 *------------------------------------------------------------
 */
const ZEP_PREAMBLE = 'EX'
const ZEP_PROTOCOL_VERSION = 2
const ZEP_PROTOCOL_TYPE = 1
/** Baseline NTP time if bit-0=0 -> 7-Feb-2036 @ 06:28:16 UTC */
const NTP_MSB_0_BASE_TIME = 2085978496000n
/** Baseline NTP time if bit-0=1 -> 1-Jan-1900 @ 01:00:00 UTC */
const NTP_MSB_1_BASE_TIME = -2208988800000n

const getZepTimestamp = (): bigint => {
    const now = BigInt(Date.now())
    const useBase1 = now < NTP_MSB_0_BASE_TIME // time < Feb-2036
    // MSB_1_BASE_TIME: dates <= Feb-2036, MSB_0_BASE_TIME: if base0 needed for dates >= Feb-2036
    const baseTime = now - (useBase1 ? NTP_MSB_1_BASE_TIME : NTP_MSB_0_BASE_TIME)
    let seconds = baseTime / 1000n
    const fraction = ((baseTime % 1000n) * 0x100000000n) / 1000n

    if (useBase1) {
        seconds |= 0x80000000n // set high-order bit if MSB_1_BASE_TIME 1900 used
    }

    return BigInt.asIntN(64, (seconds << 32n) | fraction)
}

export const createWiresharkZEPFrame = (
    channelId: number,
    deviceId: number,
    lqi: number,
    rssi: number,
    sequence: number,
    data: Buffer,
    lqiMode: boolean = false,
): Buffer => {
    const buffer = Buffer.alloc(167)
    let offset = 0

    // The IEEE 802.15.4 packet encapsulated in the ZEP frame must have the "TI CC24xx" format
    // See figure 21 on page 24 of the CC2420 datasheet: https://www.ti.com/lit/ds/symlink/cc2420.pdf
    // So, two bytes must be added at the end:
    // * First byte: RSSI value as a signed 8 bits integer (range -128 to 127)
    // * Second byte:
    //   - the most significant bit is set to 1 if the CRC of the frame is correct
    //   - the 7 least significant bits contain the LQI value as a unsigned 7 bits integer (range 0 to 127)
    data[data.length - 2] = rssi
    data[data.length - 1] = 0x80 | ((lqi >> 1) & 0x7f)

    // Protocol ID String | Character string | 2.0.3 to 4.2.5
    buffer.write(ZEP_PREAMBLE, offset)
    offset += 2

    // Protocol Version | Unsigned integer (8 bits) | 1.2.0 to 4.2.5
    buffer.writeUInt8(ZEP_PROTOCOL_VERSION, offset++)
    // Type | Unsigned integer (8 bits) | 1.2.0 to 1.8.15, 1.12.0 to 4.2.5
    buffer.writeUInt8(ZEP_PROTOCOL_TYPE, offset++)
    // Channel ID | Unsigned integer (8 bits) | 1.2.0 to 4.2.5
    buffer.writeUInt8(channelId, offset++)
    // Device ID | Unsigned integer (16 bits) | 1.2.0 to 4.2.5
    buffer.writeUint16BE(deviceId, offset)
    offset += 2

    // LQI/CRC Mode | Boolean | 1.2.0 to 4.2.5
    buffer.writeUInt8(lqiMode ? 1 : 0, offset++)
    // Link Quality Indication | Unsigned integer (8 bits) | 1.2.0 to 4.2.5
    buffer.writeUInt8(lqi, offset++)

    // Timestamp | Date and time | 1.2.0 to 4.2.5
    buffer.writeBigInt64BE(getZepTimestamp(), offset)
    offset += 8

    // Sequence Number | Unsigned integer (32 bits) | 1.2.0 to 4.2.5
    buffer.writeUint32BE(sequence, offset)
    offset += 4

    // Reserved Fields | Byte sequence | 2.0.0 to 4.2.5
    offset += 10

    // Length | Unsigned integer (8 bits) | 1.2.0 to 4.2.5
    buffer.writeUInt8(data.length, offset++)

    buffer.set(data, offset)
    offset += data.length

    return buffer.subarray(0, offset) // increased to "beyond last" above
}

/**
 * @see https://datatracker.ietf.org/doc/id/draft-gharris-opsawg-pcap-00.html
 */

/** seconds + microseconds */
export const PCAP_MAGIC_NUMBER_MS = 0xa1b2c3d4
/** seconds + nanoseconds */
export const PCAP_MAGIC_NUMBER_NS = 0xa1b23c4d
const PCAP_VERSION_MAJOR = 2
const PCAP_VERSION_MINOR = 4
/** IEEE 802.15.4 Low-Rate Wireless Networks, with each packet having the FCS at the end of the frame. */
const PCAP_LINKTYPE_IEEE802_15_4_WITH_FCS = 195

export const createPcapFileHeader = (magicNumber: number = PCAP_MAGIC_NUMBER_MS): Buffer => {
    const fileHeader = Buffer.alloc(24)

    /**
     * An unsigned magic number, whose value is either the hexadecimal number 0xA1B2C3D4 or the hexadecimal number 0xA1B23C4D.
     * If the value is 0xA1B2C3D4, time stamps in Packet Records (see Figure 2) are in seconds and microseconds;
     * if it is 0xA1B23C4D, time stamps in Packet Records are in seconds and nanoseconds.
     * These numbers can be used to distinguish sections that have been saved on little-endian machines from the ones saved on big-endian machines,
     * and to heuristically identify pcap files.
     * 32 bits
     * */
    fileHeader.writeUInt32LE(magicNumber, 0)
    /**
     * An unsigned value, giving the number of the current major version of the format.
     * The value for the current version of the format is 2.
     * This value should change if the format changes in such a way that code that reads the new format could not read the old format
     * (i.e., code to read both formats would have to check the version number and use different code paths for the two formats)
     * and code that reads the old format could not read the new format.
     * 16 bits
     */
    fileHeader.writeUInt16LE(PCAP_VERSION_MAJOR, 4)
    /**
     * An unsigned value, giving the number of the current minor version of the format.
     * The value is for the current version of the format is 4.
     * This value should change if the format changes in such a way that code that reads the new format could read the old format
     * without checking the version number but code that reads the old format could not read all files in the new format.
     * 16 bits
     */
    fileHeader.writeUInt16LE(PCAP_VERSION_MINOR, 6)
    /**
     * Not used - SHOULD be filled with 0 by pcap file writers, and MUST be ignored by pcap file readers.
     * This value was documented by some older implementations as "gmt to local correction".
     * Some older pcap file writers stored non-zero values in this field.
     * 32 bits
     */
    fileHeader.writeUInt32LE(0, 8)
    /**
     * Not used - SHOULD be filled with 0 by pcap file writers, and MUST be ignored by pcap file readers.
     * This value was documented by some older implementations as "accuracy of timestamps".
     * Some older pcap file writers stored non-zero values in this field.
     * 32 bits
     */
    fileHeader.writeUInt32LE(0, 12)
    /**
     * An unsigned value indicating the maximum number of octets captured from each packet.
     * The portion of each packet that exceeds this value will not be stored in the file.
     * This value MUST NOT be zero; if no limit was specified, the value should be a number greater than or equal
     * to the largest packet length in the file.
     * 32 bits
     */
    fileHeader.writeUInt32LE(EZSP_MAX_FRAME_LENGTH, 16)
    /**
     * An unsigned value that defines, in the lower 28 bits, the link layer type of packets in the file.
     * 32 bits
     */
    fileHeader.writeUInt32LE(PCAP_LINKTYPE_IEEE802_15_4_WITH_FCS, 20)

    return fileHeader
}

export const createPcapPacketRecordMs = (packetData: Buffer): Buffer => {
    const packetHeader = Buffer.alloc(16)
    const timestamp = (new Date().getTime() * 1000) / 1000000
    const timestampSec = Math.trunc(timestamp)

    /** 32-bit unsigned integer that represents the number of seconds that have elapsed since 1970-01-01 00:00:00 UTC */
    packetHeader.writeUInt32LE(timestampSec, 0)
    /** Number of microseconds or nanoseconds that have elapsed since that seconds. */
    packetHeader.writeUInt32LE(Math.trunc((timestamp - timestampSec) * 1000000.0), 4)
    /**
     * Unsigned value that indicates the number of octets captured from the packet (i.e. the length of the Packet Data field).
     * It will be the minimum value among the Original Packet Length and the snapshot length for the interface (SnapLen, defined in Figure 1).
     * 32 bits
     */
    packetHeader.writeUInt32LE(packetData.length, 8)
    /**
     * Unsigned value that indicates the actual length of the packet when it was transmitted on the network.
     * It can be different from the Captured Packet Length if the packet has been truncated by the capture process.
     * 32 bits
     */
    packetHeader.writeUInt32LE(packetData.length, 12)

    return Buffer.concat([packetHeader, packetData])
}
