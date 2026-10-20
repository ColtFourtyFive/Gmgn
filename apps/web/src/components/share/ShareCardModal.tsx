// PnL share card dialog: live canvas preview (dark / light variant), Download
// PNG and Copy image (ClipboardItem where the browser supports it). The
// sparkline comes from the token's candles at a resolution fitting the hold.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Download } from 'lucide-react';
import { Button, Modal, SegmentedControl } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';
import { useUi } from '@/store/ui';
import { sparklineResolution, SPARKLINE_POINTS, type PnlShareData } from './model';
import { CARD_HEIGHT, CARD_WIDTH, canvasToPng, renderPnlCard, type CardTheme } from './render';

const canCopyImages = () => typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function' && window.isSecureContext;

export interface ShareCardModalProps {
  open: boolean;
  onClose: () => void;
  data: PnlShareData;
}

export function ShareCardModal({ open, onClose, data }: ShareCardModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={`Share $${data.token.symbol} PnL`} description="A PnL card for X, Telegram or your group chat." size="lg">
      <ShareCardBody data={data} />
    </Modal>
  );
}

/** Mounted fresh on every open (Modal renders nothing while closed). */
function ShareCardBody({ data }: { data: PnlShareData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState<CardTheme>(() => useUi.getState().theme);
  const [copied, setCopied] = useState(false);
  const resolution = sparklineResolution(data.holdSeconds);
  const candles = useQuery({
    queryKey: ['share-candles', data.chain, data.token.address, resolution],
    queryFn: () => api.candles(data.chain, data.token.address, resolution, SPARKLINE_POINTS),
    staleTime: 30_000,
    retry: false,
  });
  // Draw without the chart first; redraw once candles (or the web font) arrive.
  const closes = useMemo(() => {
    const list = candles.data?.candles;
    return list?.length ? [list[0].open, ...list.map((c) => c.close)] : undefined;
  }, [candles.data]);
  useEffect(() => {
    let live = true;
    const draw = () => canvasRef.current && renderPnlCard(canvasRef.current, data, { theme, closes, scale: 2 });
    draw();
    void document.fonts?.ready.then(() => live && draw());
    return () => {
      live = false;
    };
  }, [data, theme, closes]);

  const file = `trenchscope-${data.token.symbol.toLowerCase()}-pnl.png`;
  const download = async () => {
    if (!canvasRef.current) return;
    try {
      const url = URL.createObjectURL(await canvasToPng(canvasRef.current));
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error('Couldn’t save the image', errorMessage(err));
    }
  };
  const copy = async () => {
    if (!canvasRef.current) return;
    try {
      // A promised blob keeps the user gesture alive in Safari.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToPng(canvasRef.current) })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error('Couldn’t copy the image', `${errorMessage(err)} — download it instead.`);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        role="img"
        aria-label={`$${data.token.symbol} PnL card`}
        className="aspect-[1200/675] w-full rounded border border-line"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          size="sm"
          aria-label="Card theme"
          value={theme}
          onChange={setTheme}
          items={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
        {candles.isPending && <span className="text-xs text-faint">Loading chart…</span>}
        <span className="ml-auto flex gap-2">
          {canCopyImages() && (
            <Button variant="outline" size="sm" icon={copied ? <Check size={13} /> : <Copy size={13} />} onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy image'}
            </Button>
          )}
          <Button variant="primary" size="sm" icon={<Download size={13} />} onClick={() => void download()} data-autofocus>
            Download PNG
          </Button>
        </span>
      </div>
    </div>
  );
}
