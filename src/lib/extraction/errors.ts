import type { ExtractionErrorBody } from "./types";

/** A failure with an exact reason and a concrete way to recover, so the user is never left with "unknown error". */
export class ExtractionError extends Error {
  constructor(
    readonly code: string,
    readonly reason: string,
    readonly recovery: string,
    readonly status = 400,
    readonly page?: number,
  ) {
    super(reason);
    this.name = "ExtractionError";
  }

  toBody(): ExtractionErrorBody {
    return { error: `${this.reason} ${this.recovery}`, code: this.code, reason: this.reason, recovery: this.recovery, ...(this.page ? { page: this.page } : {}) };
  }
}
