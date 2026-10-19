/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        panel: v('panel'),
        'panel-2': v('panel-2'),
        'panel-3': v('panel-3'),
        line: v('line'),
        'line-strong': v('line-strong'),
        fg: v('fg'),
        muted: v('muted'),
        faint: v('faint'),
        accent: v('accent'),
        'accent-fg': v('accent-fg'),
        up: v('up'),
        down: v('down'),
        warn: v('warn'),
        info: v('info'),
        smart: v('smart'),
        kol: v('kol'),
        dev: v('dev'),
        sniper: v('sniper'),
        insider: v('insider'),
        bundler: v('bundler'),
        whale: v('whale'),
        fresh: v('fresh'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '18px'],
        base: ['13px', '20px'],
        md: ['14px', '20px'],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      keyframes: {
        'flash-up': { '0%': { backgroundColor: 'rgb(var(--up) / 0.28)' }, '100%': { backgroundColor: 'transparent' } },
        'flash-down': { '0%': { backgroundColor: 'rgb(var(--down) / 0.28)' }, '100%': { backgroundColor: 'transparent' } },
        'slide-in': { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        pulse2: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
      },
      animation: {
        'flash-up': 'flash-up 900ms ease-out',
        'flash-down': 'flash-down 900ms ease-out',
        'slide-in': 'slide-in 240ms ease-out',
        pulse2: 'pulse2 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
