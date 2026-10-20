import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SocialLinks } from './links';

afterEach(cleanup);

const hrefs = (container: HTMLElement) => Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));

describe('SocialLinks', () => {
  it('links http(s) socials in a new tab', () => {
    const { container } = render(<SocialLinks socials={{ twitter: 'https://x.com/pepe', website: 'http://pepe.example' }} />);
    expect(hrefs(container)).toEqual(['https://x.com/pepe', 'http://pepe.example']);
    expect(container.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('never turns script, data or relative URLs into links', () => {
    const { container } = render(<SocialLinks socials={{ twitter: 'javascript:alert(1)', telegram: 'data:text/html,<b>x</b>', website: '/sol/launch' }} />);
    expect(container.innerHTML).toBe('');
  });
});
