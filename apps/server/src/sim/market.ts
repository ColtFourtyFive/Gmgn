// STUB — replaced by the market simulation implementation.
import type { AppContext } from '../context';

export class MarketSim {
  constructor(private ctx: AppContext) {}
  install(): void {}
  seedPopulation(): void {}
  serialize(): unknown {
    return null;
  }
  restore(_data: unknown): void {}
}
