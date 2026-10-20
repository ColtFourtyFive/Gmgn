"""Coin-launch cards (x/COIN_LAUNCH.md): the official-CA card (16:9 and 4:5), the scam warning and the "one CA" card.

GATED: the CA cards render for posting only from a filled config whose owner and legal sign-offs are set
(x/COIN_LAUNCH.md §1). Without one they render as TEMPLATES, stamped "TEMPLATE · NOT FOR POSTING", with a placeholder
address, so the layout can be reviewed before anything exists.

Usage:
  python3 ca_card.py scratch_dir                    # templates -> x/coin/*-TEMPLATE.png
  python3 ca_card.py scratch_dir coin.json          # real cards -> x/coin/*.png (validated first)

coin.json: {"name": "...", "ticker": "...", "chain": "sol|base|bsc|eth|robinhood", "ca": "...",
            "owner_signoff": "name, date", "legal_signoff": "name, date"}
The chain is written as text (never a chain logo, MNC-14). The ticker is printed without "$" in the card body.
"""
import importlib.util
import json
import os
import re
import subprocess
import sys

M = "/home/user/Gmgn/marketing"
S = sys.argv[1]
CFG = sys.argv[2] if len(sys.argv) > 2 else None
os.makedirs(S, exist_ok=True)
OUT = os.environ.get("COIN_OUT", f"{M}/x/coin")  # COIN_OUT: test renders outside the kit
os.makedirs(OUT, exist_ok=True)
_spec = importlib.util.spec_from_file_location("cards2", f"{M}/tools/cards2/build.py")
cards = importlib.util.module_from_spec(_spec)
sys.argv = [sys.argv[0], S]
_spec.loader.exec_module(cards)
stage, kicker, wordmark = cards.stage, cards.kicker, cards.wordmark

CHAINS = {"sol": "Solana", "base": "Base", "bsc": "BNB Chain", "eth": "Ethereum", "robinhood": "Robinhood Chain"}
CUSTODY = "we will never DM you first, ask for your seed phrase, or ask you to send funds."
RISK = "memecoins are extremely risky. most go to zero. only trade what you can afford to lose. nfa."


def validate(c):
    missing = [k for k in ("name", "ticker", "chain", "ca", "owner_signoff", "legal_signoff") if not str(c.get(k, "")).strip()]
    if missing:
        sys.exit(f"coin.json is missing {missing}: the gate in x/COIN_LAUNCH.md §1 isn't passed")
    if c["chain"] not in CHAINS:
        sys.exit(f"unknown chain {c['chain']!r}")
    ok = (re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", c["ca"]) if c["chain"] == "sol" else re.fullmatch(r"0x[0-9a-fA-F]{40}", c["ca"]))
    if not ok:
        sys.exit(f"{c['ca']!r} is not a valid {CHAINS[c['chain']]} address")


def stamp(template):
    if not template:
        return ""
    return ('<div class="mono" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-14deg);border:5px solid #FF5468;'
            'color:#FF5468;font-weight:800;font-size:64px;letter-spacing:.08em;padding:10px 34px;border-radius:12px;background:rgba(10,12,16,.6);'
            'white-space:nowrap">TEMPLATE · NOT FOR POSTING</div>')


def ca_html(ca, px):
    # First and last four characters in amber: the part people actually check.
    if len(ca) > 10 and not ca.startswith("["):
        return f'<em>{ca[:4]}</em>{ca[4:-4]}<em>{ca[-4:]}</em>'
    return ca


def ca_card(c, template, w, h):
    tall = h > w
    ca = c["ca"]
    capx = (40 if len(ca) > 42 else 44) if not tall else 36
    body = (f'<div style="position:absolute;left:{80 if not tall else 70}px;right:{80 if not tall else 70}px;top:0;'
            f'bottom:{120 if not tall else 170}px;display:flex;flex-direction:column;justify-content:center"><div>'
            f'{kicker("OFFICIAL CONTRACT ADDRESS", 24)}'
            f'<div style="margin-top:28px;font-weight:800;font-size:{72 if not tall else 76}px;letter-spacing:-.035em;line-height:1.02">'
            f'{c["name"]} <span style="color:#8C94A3">· {c["ticker"]}</span></div>'
            f'<div class="mono" style="margin-top:16px;font-weight:600;font-size:26px;color:#C9CED8">chain: {CHAINS.get(c["chain"], c["chain"])}</div>'
            f'<div class="mono" style="margin-top:{44 if not tall else 60}px;padding:28px 30px;border:2px solid #FFB547;border-radius:16px;background:rgba(255,181,71,.06);'
            f'font-weight:600;font-size:{capx}px;line-height:1.35;word-break:break-all">{ca_html(ca, capx)}</div>'
            f'<div style="margin-top:22px;font-weight:600;font-size:26px;color:#C9CED8;line-height:1.4">check the first 4 and last 4 characters. '
            f'this account and this pinned post are the only places it lives.</div>'
            f'<div style="margin-top:{20 if not tall else 40}px;font-weight:600;font-size:24px;color:#8C94A3;line-height:1.4">{CUSTODY}</div></div></div>'
            f'<div style="position:absolute;left:{80 if not tall else 70}px;right:{80 if not tall else 70}px;bottom:{50 if not tall else 70}px;display:flex;'
            f'justify-content:space-between;align-items:center"><span class="mono" style="color:#8C94A3;font-size:20px;max-width:70%">{RISK}</span>{wordmark(30)}</div>'
            + stamp(template))
    return stage(w, h, body)


def scam_card():
    w, h = 1080, 1350
    lines = ["the only contract address is the one this account posts and pins.",
             "no presale. no whitelist. no \"early access\" in your DMs.",
             "support never messages you first.",
             "a CA in someone's reply is not ours."]
    rows = "".join(f'<div style="display:flex;gap:22px;margin-top:30px"><div style="flex:none;width:14px;height:14px;margin-top:16px;border-radius:50%;'
                   f'background:#FF5468"></div><div style="font-weight:700;font-size:44px;letter-spacing:-.02em;line-height:1.2">{x}</div></div>' for x in lines)
    body = (f'<div style="position:absolute;left:84px;right:84px;top:0;bottom:150px;display:flex;flex-direction:column;justify-content:center"><div>'
            f'{kicker("READ BEFORE YOU BUY ANYTHING", 24)}'
            f'<div style="margin-top:30px;font-weight:900;font-size:96px;letter-spacing:-.04em;line-height:1">scammers <em>love</em> a launch.</div>'
            f'<div style="margin-top:30px">{rows}</div>'
            f'<div style="margin-top:56px;padding:26px 30px;border:2px solid #FFB547;border-radius:14px;font-weight:700;font-size:36px;line-height:1.3">{CUSTODY}</div></div></div>'
            f'<div style="position:absolute;left:84px;right:84px;bottom:70px;display:flex;justify-content:space-between;align-items:center">'
            f'<span class="mono" style="color:#8C94A3;font-size:22px">high risk · nfa</span>{wordmark(30)}</div>')
    return stage(w, h, body, glow="12% 92%"), w, h


def one_ca_card():
    # Pre-launch safety card: no name, no ticker, no date, no hype. Posts only after the owner's T-1 decision.
    w, h = 1600, 900
    body = (f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">'
            f'{kicker("ONE RULE", 24)}'
            f'<div style="margin-top:30px;font-weight:900;font-size:110px;letter-spacing:-.045em;line-height:1">one CA.</div>'
            f'<div style="margin-top:14px;font-weight:900;font-size:110px;letter-spacing:-.045em;line-height:1"><em>posted here. pinned here.</em></div>'
            f'<div style="margin-top:14px;font-weight:900;font-size:110px;letter-spacing:-.045em;line-height:1;color:#8C94A3">nowhere else.</div>'
            f'<div style="margin-top:46px;font-weight:600;font-size:28px;color:#C9CED8">{CUSTODY}</div></div>'
            f'<div style="position:absolute;right:80px;bottom:50px">{wordmark(30)}</div>')
    return stage(w, h, body), w, h


if __name__ == "__main__":
    if CFG:
        coin = json.load(open(CFG))
        validate(coin)
        template, sfx = False, ""
    else:
        coin = {"name": "[COIN NAME]", "ticker": "[TICKER]", "chain": "[chain]", "ca": "[contract address: posted at launch]"}
        template, sfx = True, "-TEMPLATE"
    pages = {f"ca-card-16x9{sfx}": (ca_card(coin, template, 1600, 900), 1600, 900), f"ca-card-4x5{sfx}": (ca_card(coin, template, 1080, 1350), 1080, 1350)}
    html, w, h = scam_card()
    pages["ca-scam-warning"] = (html, w, h)
    html, w, h = one_ca_card()
    pages["coin-one-ca"] = (html, w, h)
    jobs = []
    for name, (html, w, h) in pages.items():
        hp = f"{S}/{name}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{OUT}/{name}.png", "width": w, "height": h, "wait": 400})
    json.dump(jobs, open(f"{S}/jobs.json", "w"), indent=1)
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True, stdout=subprocess.DEVNULL)
    print("built", [j["out"].split("/")[-1] for j in jobs])
