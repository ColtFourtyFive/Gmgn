import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CopyButton } from '@/components/ui';
import { SocialLinks } from './links';

afterEach(cleanup);

describe('small touch targets', () => {
  it('icon-only copy buttons and social links use the enlarged touch hit area', () => {
    render(
      <>
        <CopyButton text="abc" label="Copy contract address" size={11} />
        <SocialLinks socials={{ twitter: 'https://x.com/a', telegram: 'https://t.me/a', website: 'https://a.io' }} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Copy contract address' }).classList).toContain('touch-target');
    for (const name of ['X (Twitter)', 'Telegram', 'Website']) expect(screen.getByRole('link', { name }).classList).toContain('touch-target');
  });
});
