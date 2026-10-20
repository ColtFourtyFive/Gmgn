import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import clsx from 'clsx';
import { Skeleton } from '@/components/ui';

/** SVG data URL of a QR code for `text` (null while rendering or on failure). */
export function useQrDataUrl(text: string | null): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ text: string | null; url: string | null; failed: boolean }>({ text: null, url: null, failed: false });
  useEffect(() => {
    if (!text) return;
    let cancelled = false;
    // SVG keeps it crisp at any size and needs no <canvas>; dark modules on white so every scanner reads it in both themes.
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then((svg) => !cancelled && setState({ text, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, failed: false }))
      .catch(() => !cancelled && setState({ text, url: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [text]);
  return state.text === text ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}

/** QR code image of `value` (an address or otpauth:// URI), with a text alternative. */
export function QrCode({ value, alt, size = 176, className }: { value: string | null; alt: string; size?: number; className?: string }) {
  const { url, failed } = useQrDataUrl(value);
  if (failed) {
    return (
      <p className={clsx('flex items-center justify-center rounded border border-dashed border-line p-3 text-center text-xs text-muted', className)} style={{ width: size, height: size }}>
        QR code unavailable — copy the text instead.
      </p>
    );
  }
  if (!url) return <Skeleton className={clsx('rounded', className)} width={size} height={size} />;
  return <img src={url} alt={alt} width={size} height={size} className={clsx('rounded bg-white p-1', className)} />;
}
