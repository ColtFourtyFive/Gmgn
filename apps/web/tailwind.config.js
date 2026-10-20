/** @type {import('tailwindcss').Config} */
// Every color is a CSS variable ("r g b" triplet, see src/index.css) so the
// same utility classes work in both themes and accept alpha (bg-up/10).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Scope Tailwind's `--tw-*` defaults to the elements whose utilities read
  // them, instead of `*, ::before, ::after`: ~50 custom properties on every
  // node made style recalcs of large live tables 2x slower.
  experimental: { optimizeUniversalDefaults: true },
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
        'up-fg': v('up-fg'),
        down: v('down'),
        'down-fg': v('down-fg'),
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
        bot: v('bot'),
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
      boxShadow: {
        float: 'var(--shadow-float)',
      },
      zIndex: {
        // Stacking scale: sticky table headers < top bar < overlays < floating < toasts.
        sticky: '10',
        header: '30',
        overlay: '50',
        floating: '60',
        toast: '70',
      },
      keyframes: {
        'flash-up': { '0%': { backgroundColor: 'rgb(var(--up) / 0.28)' }, '100%': { backgroundColor: 'transparent' } },
        'flash-down': { '0%': { backgroundColor: 'rgb(var(--down) / 0.28)' }, '100%': { backgroundColor: 'transparent' } },
        'slide-in': { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'slide-up': { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'pop-in': { '0%': { transform: 'scale(0.97)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'drawer-left': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        'drawer-right': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
        'drawer-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
        pulse2: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
      },
      animation: {
        'flash-up': 'flash-up 900ms ease-out',
        'flash-down': 'flash-down 900ms ease-out',
        'slide-in': 'slide-in 240ms ease-out',
        'slide-up': 'slide-up 240ms ease-out',
        'fade-in': 'fade-in 140ms ease-out',
        'pop-in': 'pop-in 140ms ease-out',
        'drawer-left': 'drawer-left 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'drawer-right': 'drawer-right 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'drawer-up': 'drawer-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        shimmer: 'shimmer 1.6s linear infinite',
        pulse2: 'pulse2 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
