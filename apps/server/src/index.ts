import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { buildApp, defaultConfig } from './app';

const webDistGuess = resolve(import.meta.dirname, '../../web/dist');
const config = defaultConfig({ webDist: process.env.WEB_DIST ?? (existsSync(webDistGuess) ? webDistGuess : null) });

const built = await buildApp(config, { logger: false });
await built.app.listen({ port: config.port, host: config.host });
console.log(`[trenchscope] api + ws listening on http://${config.host}:${config.port}${config.webDist ? ` (serving web from ${config.webDist})` : ''}`);

let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  // Live mode always writes accounts / trading / money records to the durable store on close.
  const saving = config.snapshotEveryMs > 0 ? 'saving snapshot...' : config.mode === 'live' ? 'saving the durable store (no snapshot: SNAPSHOT_EVERY_MS=0)...' : 'shutting down (SNAPSHOT_EVERY_MS=0: persistence off, nothing saved)';
  console.log(`[trenchscope] ${signal} received, ${saving}`);
  await built.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
