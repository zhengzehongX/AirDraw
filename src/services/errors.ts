import type { EngineErrorCode } from '../types/hand';

/** Error carrying a stable code so the UI can pick a message instead of parsing strings. */
export class AirDrawError extends Error {
  readonly code: EngineErrorCode;
  readonly hint?: string;

  constructor(code: EngineErrorCode, message: string, hint?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AirDrawError';
    this.code = code;
    this.hint = hint;
  }
}

export function toEngineError(err: unknown): { code: EngineErrorCode; message: string; hint?: string } {
  if (err instanceof AirDrawError) {
    return { code: err.code, message: err.message, hint: err.hint };
  }
  return {
    code: 'unknown',
    message: err instanceof Error ? err.message : String(err),
  };
}
