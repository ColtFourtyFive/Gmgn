// Server validation errors read "field.path: message" (400, code invalid_input).
// Forms use this to show the message under the offending field.

import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/format';

export interface FieldError {
  /** Top-level field name ("strategy" for "strategy.takeProfits.0.sellPercent"), or null. */
  field: string | null;
  message: string;
}

/** Split an API error into the field it names (if any) and a readable message. */
export function splitFieldError(err: unknown): FieldError {
  const message = errorMessage(err);
  if (err instanceof ApiError && err.status === 400) {
    const m = /^([a-zA-Z][\w.]*): (.+)$/.exec(message);
    if (m) return { field: m[1].split('.')[0], message: capitalize(m[2]) };
  }
  return { field: null, message: capitalize(message) };
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
