// Marketing capture: blur every demo ticker and token name on the page, wherever it is printed (toasts, trade panel,
// tables, dialogs, search). Demo symbols can collide with real coins (ledger §7.3).
// Uses the CSS Custom Highlight API, so React's DOM is never touched: text ranges matching the demo market's symbols
// ($SYM or SYM, case-sensitive, whole word), names and @handles are painted transparent with a soft glow. The word list comes
// from the local API (all four chains) and refreshes every 10 s; ranges are recomputed on DOM changes.
// Load with page.addInitScript({ path }) after capture-mode.js.
(() => {
  const STOP = new Set(['SOL', 'ETH', 'BNB', 'BASE', 'BSC', 'USD', 'USDC', 'USDT', 'MC', 'KOL', 'DEV', 'TOP', 'ATH', 'LP', 'MAX', 'AMM', 'TX',
    'NEW', 'ALL', 'BUY', 'SELL', 'PNL', 'MEV', 'TP', 'SL', 'OK', 'NFA', 'AI', 'UI', 'API',
    'New', 'All', 'Buy', 'Sell', 'Smart', 'Whale', 'Sniper', 'Snipers', 'Insider', 'Insiders', 'Bundler', 'Bundlers', 'Fresh', 'Bot', 'Bots',
    'Dev', 'Holders', 'Activity', 'Trending', 'Monitor', 'Signals', 'Leaderboard', 'Portfolio', 'Narratives', 'Trenches', 'Following',
    'Market', 'Limit', 'Auto', 'Chart', 'Trade', 'Info', 'Price', 'Volume', 'Live', 'Migrated', 'Copy', 'Mine', 'You']);
  let words = [];
  let re = null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  async function loadWords() {
    const set = new Set();
    for (const chain of ['sol', 'base', 'bsc', 'eth']) {
      try {
        const r = await (await fetch(`/api/${chain}/trenches?limit=100`)).json();
        for (const t of [...(r.new || []), ...(r.almost || []), ...(r.migrated || [])]) {
          if (t.symbol && t.symbol.length >= 2 && !STOP.has(t.symbol)) set.add(t.symbol);
          if (t.name && t.name.length >= 4 && !STOP.has(t.name)) set.add(t.name);
        }
      } catch {}
    }
    words = [...set].sort((a, b) => b.length - a.length);
    // Demo KOL handles (@name) too: they can match real accounts.
    const alt = ['@[A-Za-z0-9_]{3,}', ...words.map((w) => `\\$?${esc(w)}`)];
    re = new RegExp(`(?<![\\w$@])(?:${alt.join('|')})(?![\\w])`, 'g');
    paint();
  }
  function paint() {
    if (!re || !document.body || !('highlights' in CSS)) return;
    const ranges = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const v = n.nodeValue;
      if (!v || v.length < 2) continue;
      re.lastIndex = 0;
      for (const m of v.matchAll(re)) {
        const r = new Range();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        ranges.push(r);
      }
    }
    CSS.highlights.set('ts-ticker', new Highlight(...ranges));
  }
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; paint(); }); } };
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '::highlight(ts-ticker){color:transparent;text-shadow:0 0 12px rgba(230,233,240,.9)}';
    document.head.appendChild(s);
    new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, characterData: true });
    loadWords();
    setInterval(loadWords, 10_000);
  });
})();
