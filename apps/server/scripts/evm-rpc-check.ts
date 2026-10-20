// Read-only connectivity check for the live EVM chains: block number, gas
// price and the wrapped-native contract over each chain's configured RPCs.
// Usage: npx tsx scripts/evm-rpc-check.ts

import { erc20Abi } from 'viem';
import { EVM_CHAINS } from '../src/live/evm/chains';
import { createEvmPublicClient } from '../src/live/evm/clients';
import { loadEvmLiveConfig } from '../src/live/evm/config';

const { config, problems } = loadEvmLiveConfig();
for (const p of problems) console.warn(`[config] ${p}`);
for (const cfg of Object.values(config.chains)) {
  const info = EVM_CHAINS[cfg.chain];
  const client = createEvmPublicClient(cfg);
  try {
    const [block, gas, chainId, symbol] = await Promise.all([
      client.getBlockNumber(),
      client.getGasPrice(),
      client.getChainId(),
      client.readContract({ address: info.wrappedNative, abi: erc20Abi, functionName: 'symbol' }),
    ]);
    const ok = chainId === info.chainId ? 'ok' : `CHAIN ID MISMATCH (${chainId})`;
    console.log(`${info.viem.name.padEnd(16)} ${ok} block ${block} gas ${(Number(gas) / 1e9).toFixed(4)} gwei wrapped ${symbol}`);
  } catch (err) {
    console.log(`${info.viem.name.padEnd(16)} FAILED ${(err as Error).message.split('\n')[0]}`);
  }
}
