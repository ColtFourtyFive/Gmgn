"""Wallet-tag chips rebuilt at any size from the app's own definitions.

Matches WalletTagBadge (apps/web/src/components/common/WalletTags.tsx): the tag colour on a 14% fill,
the tag's lucide icon (stroke 2.25 on a 24 grid) and the label, rounded 4/16 of the height.
Icon geometry is read from the installed lucide-react package, so it can't drift from the app.

    from chips import chip_html
    chip_html("sniper", px=48)   # px = label font size
"""
import glob
import re

TAGS = {
    "smart": ("Smart", "brain", "#4ADE80"),
    "kol": ("KOL", "megaphone", "#C084FC"),
    "sniper": ("Sniper", "crosshair", "#F87171"),
    "bundler": ("Bundler", "boxes", "#FACC15"),
    "insider": ("Insider", "venetian-mask", "#F472B6"),
    "dev": ("Dev", "code", "#FB923C"),
    "whale": ("Whale", "waves", "#38BDF8"),
    "fresh": ("Fresh", "sprout", "#2DD4BF"),
    "bot": ("Bot", "bot", "#94A3B8"),
    "you": ("You", "user", "#FFB547"),
}
_ICONS = glob.glob("/home/user/Gmgn/node_modules/.pnpm/lucide-react@*/node_modules/lucide-react/dist/esm/icons")[0]


def icon_svg(name, color, size):
    src = open(f"{_ICONS}/{name}.js").read()
    body = src[src.index("__iconNode = [") + len("__iconNode = "):src.index("];") + 1]
    els = []
    for tag, attrs in re.findall(r'\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]', body):
        kv = " ".join(f'{k}="{v}"' for k, v in re.findall(r'(\w+):\s*"([^"]*)"', attrs) if k != "key")
        els.append(f"<{tag} {kv}/>")
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2.25" '
            f'stroke-linecap="round" stroke-linejoin="round">{"".join(els)}</svg>')


def chip_html(tag, px=40, label=None):
    text, icon, color = TAGS[tag]
    return (f'<span style="display:inline-flex;align-items:center;gap:{px * 0.3:.0f}px;padding:{px * 0.12:.0f}px {px * 0.45:.0f}px;'
            f'border-radius:{px * 0.25:.0f}px;background:{color}24;color:{color};font-family:Inter,sans-serif;font-weight:500;'
            f'font-size:{px}px;line-height:1.25;white-space:nowrap">{icon_svg(icon, color, round(px * 1.1))}{label or text}</span>')
