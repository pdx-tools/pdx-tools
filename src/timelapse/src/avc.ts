/**
 * Repairs the H.264 decoder description a browser hands the muxer.
 *
 * Firefox on Windows (Media Foundation) writes each SPS and PPS into the
 * AVCDecoderConfigurationRecord with its NAL header byte twice. The packets
 * themselves are correct, so browsers that resync from the in-band parameter
 * sets still play the file, but Windows Media Player reads the record, finds
 * an SPS that does not parse, and reports the codec as unsupported.
 */

const SPS = 7;
const PPS = 8;

/** The profile_idc values H.264 defines; the byte after an SPS header is one of these. */
const PROFILES = new Set([
  44, 66, 77, 83, 86, 88, 100, 110, 118, 122, 128, 134, 135, 138, 139, 244,
]);

function nalType(header: number): number {
  return header & 0x1f;
}

/**
 * Returns `description` with a doubled NAL header stripped from every SPS
 * and PPS, or the input itself when the record is sound or unreadable.
 */
export function repairAvcDescription(
  description: AllowSharedBufferSource,
): AllowSharedBufferSource {
  const bytes = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);

  // configurationVersion, profile, compatibility, level, lengthSizeMinusOne, numOfSPS
  if (bytes.length < 6 || bytes[0] !== 1) return description;

  const sets: { offset: number; length: number }[] = [];
  let p = 5;
  const spsCount = bytes[p++] & 0x1f;
  for (let i = 0; i < spsCount; i++) {
    if (p + 2 > bytes.length) return description;
    const length = (bytes[p] << 8) | bytes[p + 1];
    sets.push({ offset: p + 2, length });
    p += 2 + length;
  }
  if (p >= bytes.length) return description;
  const ppsCount = bytes[p++];
  for (let i = 0; i < ppsCount; i++) {
    if (p + 2 > bytes.length) return description;
    const length = (bytes[p] << 8) | bytes[p + 1];
    sets.push({ offset: p + 2, length });
    p += 2 + length;
  }
  if (p > bytes.length || spsCount === 0) return description;

  // The first SPS decides. Its second byte is profile_idc, which is never a
  // NAL header, so an SPS that opens with two header bytes was doubled.
  const sps = bytes.subarray(sets[0].offset, sets[0].offset + sets[0].length);
  const doubled =
    sps.length >= 3 &&
    nalType(sps[0]) === SPS &&
    sps[0] === sps[1] &&
    !PROFILES.has(sps[1]) &&
    PROFILES.has(sps[2]);
  if (!doubled) return description;

  const isDoubled = (set: Uint8Array) =>
    set.length >= 2 && set[0] === set[1] && (nalType(set[0]) === SPS || nalType(set[0]) === PPS);

  const out: number[] = [];
  let q = 0;
  for (const { offset, length } of sets) {
    // Copy up to and including the length prefix, then rewrite it.
    for (; q < offset - 2; q++) out.push(bytes[q]);
    const set = bytes.subarray(offset, offset + length);
    const repaired = isDoubled(set) ? set.subarray(1) : set;
    out.push(repaired.length >> 8, repaired.length & 0xff);
    for (const b of repaired) out.push(b);
    q = offset + length;
  }
  for (; q < bytes.length; q++) out.push(bytes[q]);
  return new Uint8Array(out);
}
