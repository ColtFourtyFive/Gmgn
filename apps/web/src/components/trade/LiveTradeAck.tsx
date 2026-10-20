// One-time acknowledgement before the first live trade: orders execute on
// Solana mainnet with real funds. Remembered per browser (localStorage, when
// available) and, failing that, for the rest of the page session. Every path
// that places a live order awaits ensureLiveTradeAck() first; in demo it
// resolves true at once.

import { useState } from 'react';
import { create } from 'zustand';
import { TriangleAlert } from 'lucide-react';
import { Button, Checkbox, Modal } from '@/components/ui';
import { isLiveMode } from '@/lib/mode';

export const LIVE_ACK_KEY = 'ts.liveTradeAck';

/** Acknowledged in this page session (covers browsers where storage is unavailable). */
let sessionAck = false;

export function hasLiveTradeAck(): boolean {
  if (sessionAck) return true;
  try {
    return localStorage.getItem(LIVE_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberAck(): void {
  sessionAck = true;
  try {
    localStorage.setItem(LIVE_ACK_KEY, '1');
  } catch {
    /* storage unavailable: remembered for this session only */
  }
}

/** Waiting callers (several trades may ask before the dialog is answered). */
const useAckPrompt = create<{ waiting: ((ok: boolean) => void)[] }>(() => ({ waiting: [] }));

function settle(ok: boolean): void {
  const { waiting } = useAckPrompt.getState();
  useAckPrompt.setState({ waiting: [] });
  for (const resolve of waiting) resolve(ok);
}

/** Resolves true when trading may proceed: demo, already acknowledged, or the user confirms now. */
export function ensureLiveTradeAck(): Promise<boolean> {
  if (!isLiveMode() || hasLiveTradeAck()) return Promise.resolve(true);
  return new Promise((resolve) => useAckPrompt.setState((s) => ({ waiting: [...s.waiting, resolve] })));
}

/** Test helper: forget the acknowledgement (memory and storage). */
export function resetLiveTradeAck(): void {
  sessionAck = false;
  try {
    localStorage.removeItem(LIVE_ACK_KEY);
  } catch {
    /* storage unavailable */
  }
  settle(false);
}

/** The acknowledgement dialog (mounted once by the shell). */
export function LiveTradeAckDialog() {
  const open = useAckPrompt((s) => s.waiting.length > 0);
  return (
    <Modal open={open} onClose={() => settle(false)} size="sm" title="Real funds on Solana mainnet" description="Read this once before your first trade.">
      <AckBody />
    </Modal>
  );
}

function AckBody() {
  const [checked, setChecked] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded border border-warn/40 bg-warn/10 p-2.5 text-sm text-fg">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>Orders execute on Solana mainnet with the SOL and tokens in your wallet.</li>
          <li>Trades are final and can’t be reversed. Memecoins can lose all their value within minutes.</li>
          <li>Network and priority fees are paid even when a transaction fails.</li>
        </ul>
      </div>
      <Checkbox checked={checked} onChange={setChecked} label="I understand that orders execute on Solana mainnet with real funds" />
      <div className="-mx-4 -mb-4 mt-1 flex justify-end gap-2 border-t border-line px-4 py-3">
        <Button variant="ghost" onClick={() => settle(false)} data-autofocus>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!checked}
          onClick={() => {
            rememberAck();
            settle(true);
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
