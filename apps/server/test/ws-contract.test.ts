import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

/** Message types the server publishes on the `user` channel (every `publishUser(id, '<type>', …)`). */
function serverUserTypes(): string[] {
  const dir = join(root, 'apps/server/src');
  const types = new Set<string>();
  for (const file of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.ts')) continue;
    const src = readFileSync(join(dir, file), 'utf8');
    for (const m of src.matchAll(/\.publishUser\(\s*[^,]+,\s*'([a-z]+)'/g)) types.add(m[1]!);
  }
  return [...types].sort();
}

/** Types listed for `user` in the realtime protocol comment of packages/shared/src/types.ts. */
function contractUserTypes(): string[] {
  const lines = read('packages/shared/src/types.ts').split('\n');
  const start = lines.findIndex((l) => /^ \*\s+user\b.*->/.test(l));
  expect(start, 'user channel entry in the types.ts realtime protocol comment').toBeGreaterThan(-1);
  const types: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    // The entry is its own line plus continuation lines that start with `->`.
    if (i > start && !/^ \*\s+->/.test(line)) break;
    for (const m of line.matchAll(/'([a-z]+)'/g)) types.push(m[1]!);
  }
  return types.sort();
}

/** Types listed for `user` in the docs/API.md WebSocket table. */
function apiDocUserTypes(): string[] {
  const lines = read('docs/API.md').split('\n');
  const start = lines.findIndex((l) => l.startsWith('| `user`'));
  expect(start, 'user channel row in docs/API.md').toBeGreaterThan(-1);
  const types: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = lines[i]!.split('|').map((c) => c.trim());
    // Continuation rows leave the channel cell empty.
    if (i > start && (cells[0] !== '' || cells[1] !== '')) break;
    const m = /^`([a-z]+)`$/.exec(cells[2] ?? '');
    if (m) types.push(m[1]!);
  }
  return types.sort();
}

describe('user channel contract', () => {
  it('types.ts lists exactly the message types the server publishes on the user channel', () => {
    const server = serverUserTypes();
    expect(server).toContain('fill');
    expect(contractUserTypes()).toEqual(server);
  });

  it('docs/API.md lists the same user channel message types', () => {
    expect(apiDocUserTypes()).toEqual(serverUserTypes());
  });
});
