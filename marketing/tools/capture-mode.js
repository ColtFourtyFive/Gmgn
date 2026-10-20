// Marketing capture mode: the real app UI on demo data, minus the simulator-only wording.
// Load it with page.addInitScript({ path }) before navigating. Every asset captured this way
// carries the "UI shown with demo data" line, added in post (research/POSITIONING.md).
(() => {
  // Text nodes whose whole element is hidden (sim notices, faucet controls, the unconfirmed fee line).
  const HIDE = [
    /^\s*Simulated market · paper trading\.?\s*$/,
    /^\s*Paper trading on simulated markets/,
    /^\s*Faucet\s*$/,
    /^\s*Top up\s*$/,
    /^\s*Your (paper )?wallets are funded on every chain\.?\s*$/,
    /^\s*Live\s*$/, // the green "Live" pills: demo data is not live
    /^\s*\d+\s?ms\s*$/, // the status bar's ping
    /^\s*ms\s*$/, // ...when React renders the number and the unit as separate text nodes
  ];
  // In-place rewrites of sim-only phrasing into the live product's wording.
  const REPLACE = [
    [/Our simulated audit flagged this token\. Paper trades only — but trade it like it’s real\./, 'Our audit flagged this token. Review the reasons before you buy.'],
    [/Simulated audit — reference only\./, 'Audit — reference only.'],
    [/Simulated checks\. Reference only\./, 'Checks are reference only.'],
    [/^Simulated launches on /, 'Launches on '],
    [/Paper trade on /, 'Trade on '],
    [/Paper trade — no real funds\./, ''],
    [/Start paper trading/, 'Start trading'],
    [/Paper balance:/, 'Balance:'],
    [/Paper PnL/, 'PnL'],
    [/ \(simulated\)/, ''],
    [/simulated market/gi, 'market'],
    [/\bpaper wallets?\b/gi, (m) => (m.endsWith('s') ? 'wallets' : 'wallet')],
    [/\bpaper trades?\b/gi, (m) => (m.endsWith('s') ? 'trades' : 'trade')],
    [/\bpaper portfolio\b/gi, 'portfolio'],
    [/^guest_[a-z0-9]+$/, 'demo'],
    [/\s*·\s*\d+\s?ms\b/g, ''], // simulated latency in fill toasts
    // Fictional demo venue names read as real brands; show the generic role instead.
    [/\b(Moonpit|Bonkfire|Rayforge|FourPad|BNB Rocket|ClawLab|BaseDrop|EtherForge)\b/g, 'launchpad'],
    [/\bTrenchSwap\b/g, 'dex'],
  ];
  const ATTRS = ['title', 'aria-label', 'placeholder'];

  const rewrite = (s) => REPLACE.reduce((acc, [re, to]) => acc.replace(re, to), s);

  function textNode(n) {
    const v = n.nodeValue;
    if (!v || !v.trim()) return;
    const el = n.parentElement;
    if (!el || el.closest('script,style')) return;
    if (HIDE.some((re) => re.test(v))) {
      el.style.setProperty('display', 'none', 'important');
      return;
    }
    const next = rewrite(v);
    if (next !== v) n.nodeValue = next;
  }

  function element(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) {
        const next = rewrite(v);
        if (next !== v) el.setAttribute(a, next);
      }
    }
  }

  function walk(root) {
    if (root.nodeType === Node.TEXT_NODE) return textNode(root);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    element(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) (n.nodeType === Node.TEXT_NODE ? textNode(n) : element(n));
  }

  function start() {
    // Chain marks render in the chains' brand colours; neutralise them (ledger §7.11, F-7).
    const css = document.createElement('style');
    css.textContent = ['Solana', 'BNB Chain', 'Base', 'Ethereum']
      .map((n) => `span[role="img"][aria-label="${n}"]`).join(',') + '{background:#2A303B!important;color:#E6E9F0!important}';
    document.head.appendChild(css);
    walk(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') element(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
