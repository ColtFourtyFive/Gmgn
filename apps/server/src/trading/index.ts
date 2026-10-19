// STUB — replaced by the trading implementation.
import type { FastifyInstance } from 'fastify';
import type { AppContext, TradingApi } from '../context';

export class Trading implements TradingApi {
  constructor(private ctx: AppContext) {}
  install(): void {}
  serialize(): unknown {
    return null;
  }
  restore(_data: unknown): void {}
}

export async function registerTradingRoutes(_app: FastifyInstance, _ctx: AppContext): Promise<void> {}
