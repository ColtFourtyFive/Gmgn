// Security headers on every response: the API and the served SPA (CSP with the built
// index.html's inline scripts allowed by hash, no framing, no sniffing).

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, defaultConfig, securityHeaders, type BuiltApp } from '../src/app';

const INLINE = "\n      try { document.documentElement.dataset.theme = localStorage.getItem('ts.theme') || 'dark'; } catch (e) {}\n    ";
const INDEX = `<!doctype html><html><head><title>T</title><script>${INLINE}</script><script type="module" crossorigin src="/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>`;

let dist: string;
let built: BuiltApp;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'trenchscope-web-'));
  writeFileSync(join(dist, 'index.html'), INDEX);
  built = await buildApp(defaultConfig({ warmupMinutes: 0, snapshotEveryMs: 0, webDist: dist }), { start: false, persist: false });
});

afterAll(async () => {
  await built.close();
  rmSync(dist, { recursive: true, force: true });
});

const directives = (csp: string) => new Map(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));

describe('security headers', () => {
  it('builds a CSP for the SPA: own scripts plus the inline ones by hash, fonts, inline styles, ws connections, no framing', () => {
    const headers = securityHeaders(dist);
    const csp = directives(headers['content-security-policy']);
    const hash = `'sha256-${createHash('sha256').update(INLINE, 'utf8').digest('base64')}'`;
    expect(csp.get('script-src')).toEqual(["'self'", hash]);
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
    expect(csp.get('font-src')).toEqual(["'self'", 'https://fonts.gstatic.com', 'data:']);
    expect(csp.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(csp.get('connect-src')).toEqual(["'self'", 'ws:', 'wss:']);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
      'permissions-policy': expect.stringContaining('camera=()'),
    });
    // without a build there is nothing inline to allow
    expect(directives(securityHeaders(null)['content-security-policy']).get('script-src')).toEqual(["'self'"]);
  });

  it('sends them on API responses, errors, the SPA and its client-side routes', async () => {
    const expected = securityHeaders(dist);
    for (const url of ['/api/health', '/api/meta', '/api/nope', '/api/sol/tokens/missing', '/', '/sol/trenches']) {
      const res = await built.app.inject({ method: 'GET', url });
      for (const [name, value] of Object.entries(expected)) expect(res.headers[name], `${url} ${name}`).toBe(value);
    }
    const spa = await built.app.inject({ method: 'GET', url: '/sol/token/abc' });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('<div id="root">');
  });
});
