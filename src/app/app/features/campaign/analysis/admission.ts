export type AdmissionLimits = {
  /** The limit for the resident data of the session. */
  residentBytes: number;
  /** The limit for active parsers and resident data together. */
  parserBytes: number;
};

/** The error name when an import starts while another import runs. */
export const IMPORT_BUSY_ERROR = "AnalysisImportBusy";

/**
 * The right to change resident data. One import in the tab has it. Release it
 * when all parses and appends of the import have settled.
 */
export type ImportLease = {
  /** False after the release. */
  active: () => boolean;
  /** The resident limit of the session that this import adds to. */
  residentLimit: () => number;
  /** True when `parsers` parsers of `peakBytes` each fit next to the resident data. */
  parsersFit: (parsers: number, peakBytes: number) => boolean;
  release: () => void;
};

/**
 * The memory admission for all campaign analysis in the tab, for all games.
 *
 * Only one import runs at a time. That import gets a lease, and its session
 * checks the resident limit of the lease when it appends. The tab keeps one
 * session: a session that starts releases the others. The session reports
 * the bytes that it keeps after an append, a clear, a release or a worker loss.
 */
export class AnalysisAdmission {
  /** The session that keeps resident data, and its bytes. */
  private resident: { session: string; bytes: number } | null = null;
  private lease: ImportLease | undefined;

  constructor(readonly limits: AdmissionLimits) {}

  /**
   * Set the memory that a session keeps, after an append, a clear or a
   * worker loss. Zero from a session that keeps nothing changes nothing.
   */
  setResident(session: string, bufferBytes: number) {
    if (bufferBytes > 0) this.resident = { session, bytes: bufferBytes };
    else if (this.resident?.session === session) this.resident = null;
  }

  residentBytes() {
    return this.resident?.bytes ?? 0;
  }

  /** Start an import. Throws if another import runs. */
  acquireImport(): ImportLease {
    if (this.lease) {
      const error = Error("An analysis is already running.");
      error.name = IMPORT_BUSY_ERROR;
      throw error;
    }
    let active = true;
    const lease: ImportLease = {
      active: () => active,
      residentLimit: () => this.limits.residentBytes,
      parsersFit: (parsers, peakBytes) =>
        parsers * peakBytes + this.residentBytes() <= this.limits.parserBytes,
      release: () => {
        if (!active) return;
        active = false;
        this.lease = undefined;
      },
    };
    return (this.lease = lease);
  }
}

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

/**
 * The limit for resident buffers: a quarter of the device memory, from
 * 256 MiB to 1.5 GiB. The browser reports at most 8 GiB.
 */
export function residentMemoryLimit(deviceMemoryGiB = 4) {
  return Math.min(1536, Math.max(256, (deviceMemoryGiB * 1024) / 4)) * MiB;
}

/** About two thirds of the device memory, less 512 MiB for the page. */
export function parserMemoryLimit(deviceMemoryGiB = 4) {
  return Math.max(0, Math.floor(deviceMemoryGiB * 0.65 * GiB - 512 * MiB));
}

let shared: AnalysisAdmission | undefined;

/**
 * The admission for this tab. Device memory is a hint. Without it, use the
 * limits of a 4 GiB device.
 */
export function analysisAdmission() {
  const memory = (globalThis.navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (shared ??= new AnalysisAdmission({
    residentBytes: residentMemoryLimit(memory),
    parserBytes: parserMemoryLimit(memory),
  }));
}
