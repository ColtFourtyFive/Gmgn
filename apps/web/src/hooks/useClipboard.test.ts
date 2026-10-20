import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './useClipboard';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('copyText', () => {
  it('outside a secure context (http://<lan-ip>) copies through a textarea and gives focus back to the copy button', async () => {
    vi.stubGlobal('isSecureContext', false);
    const exec = vi.fn(() => true);
    document.execCommand = exec as unknown as typeof document.execCommand;
    const button = document.createElement('button');
    button.textContent = 'Copy contract address';
    document.body.appendChild(button);
    button.focus();

    expect(await copyText('So1anaMint111')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
