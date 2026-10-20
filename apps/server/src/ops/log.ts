// Structured JSON logging with secret redaction. One line per entry on stdout:
// {"time":"…","level":"info","msg":"…",…fields}. Fields under keys that look
// secret (key, secret, token, password, authorization, cookie) are replaced,
// and strings are scrubbed of URL credentials, secret query parameters and
// bearer tokens, so an RPC URL or a request URL can be logged as-is.
//
// The logger is pino-shaped (`log.info(fields, msg)` or `log.info(msg)`,
// `child(bindings, { serializers, level })`, all of Fastify's required
// methods), so it can be handed to Fastify as `loggerInstance` as well as used
// directly.

import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type LogMethod = (objOrMsg?: unknown, msg?: string) => void;
type Serializer = (value: never) => unknown;

export interface Logger {
  level: LogLevel | 'silent';
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  silent: LogMethod;
  child(bindings: Record<string, unknown>, opts?: { level?: string; serializers?: Record<string, Serializer> }): Logger;
}

export interface LoggerOptions {
  /** Minimum level written (default LOG_LEVEL or info). */
  level?: LogLevel | 'silent';
  /** Fields on every line (e.g. { svc, mode }). */
  base?: Record<string, unknown>;
  /** Where lines go (default stdout). */
  write?: (line: string) => void;
}

const LEVELS: Record<LogLevel | 'silent', number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: Infinity };

/** Keys whose values are never logged (strings, buffers, objects; plain counts such as `tokens: 12` stay). */
export const SECRET_KEY = /key|secret|token|password|authorization|cookie/i;
export const REDACTED = '[redacted]';
const MAX_DEPTH = 8;
const MAX_ITEMS = 100;

/** Drop credentials from a string: user:pass@ in URLs, secret query parameters, bearer tokens, path-embedded RPC keys. */
export function scrubString(s: string): string {
  if (s.length > 10_000) s = `${s.slice(0, 10_000)}…`;
  return s
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, `$1${REDACTED}@`)
    .replace(/([?&;](?:[a-z0-9_-]*(?:key|secret|token|password|auth|signature)[a-z0-9_-]*)=)[^&\s#"']+/gi, `$1${REDACTED}`)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${REDACTED}`)
    // Providers that put the API key in the path: Alchemy / Infura (/v2/<key>, /v3/<key>), QuickNode (/<token>/).
    .replace(/(\/v[23]\/)[A-Za-z0-9_-]{16,}/g, `$1${REDACTED}`)
    .replace(/(\.quiknode\.pro\/)[A-Za-z0-9_-]{16,}/gi, `$1${REDACTED}`);
}

/** A copy of `value` safe to log: secret-looking keys replaced, strings scrubbed, cycles and depth bounded. */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[depth]';
  seen.add(value);
  try {
    if (value instanceof Error) {
      const out: Record<string, unknown> = { type: value.name, message: scrubString(value.message) };
      if (value.stack) out.stack = scrubString(value.stack);
      for (const [k, v] of Object.entries(value)) out[k] = redactField(k, v, depth, seen);
      if (value.cause !== undefined) out.cause = redact(value.cause, depth + 1, seen);
      return out;
    }
    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return `[${value.byteLength} bytes]`;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Map) value = Object.fromEntries(value);
    else if (value instanceof Set) value = [...value];
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1, seen));
      if (value.length > MAX_ITEMS) items.push(`…${value.length - MAX_ITEMS} more`);
      return items;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactField(k, v, depth, seen);
    return out;
  } finally {
    seen.delete(value as object);
  }
}

function redactField(key: string, v: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (SECRET_KEY.test(key) && v !== null && v !== undefined && typeof v !== 'number' && typeof v !== 'boolean') return REDACTED;
  return redact(v, depth + 1, seen);
}

/** Path of a URL without its query string (queries may carry tokens). */
export function pathOnly(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

const defaultSerializers: Record<string, Serializer> = {
  req: ((req: { method?: string; url?: string; id?: string; ip?: string }) => ({ method: req.method, url: req.url, reqId: req.id, remoteAddress: req.ip })) as Serializer,
  res: ((res: { statusCode?: number }) => ({ statusCode: res.statusCode })) as Serializer,
};

function envLevel(): LogLevel | 'silent' {
  const v = process.env.LOG_LEVEL?.trim().toLowerCase();
  return v && v in LEVELS ? (v as LogLevel | 'silent') : 'info';
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  return makeLogger(write, opts.level ?? envLevel(), { ...opts.base }, defaultSerializers);
}

function makeLogger(write: (line: string) => void, level: LogLevel | 'silent', bindings: Record<string, unknown>, serializers: Record<string, Serializer>): Logger {
  const emit = (lvl: LogLevel) => (objOrMsg?: unknown, msg?: string) => {
    if (LEVELS[lvl] < LEVELS[logger.level]) return;
    let fields: Record<string, unknown> = {};
    let message = msg;
    if (typeof objOrMsg === 'string') message = objOrMsg;
    else if (objOrMsg instanceof Error) {
      fields = { err: objOrMsg };
      message ??= objOrMsg.message;
    } else if (objOrMsg && typeof objOrMsg === 'object') fields = { ...(objOrMsg as Record<string, unknown>) };
    for (const [k, fn] of Object.entries(serializers)) {
      if (fields[k] !== undefined && k !== 'err') fields[k] = (fn as (v: unknown) => unknown)(fields[k]);
    }
    const entry = redact({ ...bindings, ...fields }) as Record<string, unknown>;
    // time, level and msg lead the line and cannot be overridden by fields
    delete entry.time;
    delete entry.level;
    delete entry.msg;
    const time = new Date().toISOString();
    const text = message === undefined ? undefined : scrubString(String(message));
    let line: string;
    try {
      line = JSON.stringify({ time, level: lvl, msg: text, ...entry });
    } catch {
      line = JSON.stringify({ time: new Date().toISOString(), level: lvl, msg: 'unserializable log entry' });
    }
    write(line);
  };
  const logger: Logger = {
    level,
    trace: emit('trace'),
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
    fatal: emit('fatal'),
    silent: () => {},
    child(childBindings, childOpts = {}) {
      const lvl = childOpts.level && childOpts.level in LEVELS ? (childOpts.level as LogLevel | 'silent') : logger.level;
      return makeLogger(write, lvl, { ...bindings, ...childBindings }, { ...serializers, ...childOpts.serializers });
    },
  };
  return logger;
}

// ---------------------------------------------------------------------------
// Request ids
// ---------------------------------------------------------------------------

const requestIds = new WeakMap<FastifyRequest, string>();
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Assign a request id: the proxy's X-Request-Id when the proxy is trusted and the value is sane,
 * otherwise a fresh UUID. Echoed as the x-request-id response header by the ops hooks.
 */
export function assignRequestId(req: FastifyRequest, trustIncoming: boolean): string {
  const incoming = req.headers['x-request-id'];
  const id = trustIncoming && typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  requestIds.set(req, id);
  return id;
}

/** The request's id for log lines (Fastify's own req.id when the ops hooks did not run). */
export function requestIdOf(req: FastifyRequest): string {
  return requestIds.get(req) ?? req.id;
}
