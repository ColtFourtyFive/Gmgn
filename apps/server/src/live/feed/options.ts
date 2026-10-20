// Ingestion tuning from the environment (live mode). Credentials and endpoints
// live in LiveConfig (live/config.ts); these are the ingestion-only knobs:
//   PUMPPORTAL_API_KEY       optional key for the data feed (token / account trade streams may need one)
//   LIVE_RPC_RPS             RPC requests per second the ingestion may spend (default 5)
//   LIVE_KOL_FILE            JSON list of KOL wallets [{ address, name, twitter? }]
//   LIVE_TOKEN_IDLE_MINUTES  unsubscribe a token's trades after this long without one (default 30)
//   LIVE_LOGS_CATCHUP_MINTS  tokens whose transactions are read back after a program-log gap (default 10, 0 = off)

export interface IngestEnv {
  pumpPortalApiKey: string | null;
  rpcRps: number;
  kolFile: string | null;
  idleMs: number;
  logsCatchUpMints: number;
}

function num(raw: string | undefined, fallback: number, lo: number, hi: number): number {
  const n = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export function loadIngestEnv(e: NodeJS.ProcessEnv = process.env): IngestEnv {
  return {
    pumpPortalApiKey: e.PUMPPORTAL_API_KEY?.trim() || null,
    rpcRps: num(e.LIVE_RPC_RPS, 5, 0.5, 500),
    kolFile: e.LIVE_KOL_FILE?.trim() || null,
    idleMs: num(e.LIVE_TOKEN_IDLE_MINUTES, 30, 1, 24 * 60) * 60_000,
    logsCatchUpMints: Math.round(num(e.LIVE_LOGS_CATCHUP_MINTS, 10, 0, 100)),
  };
}
