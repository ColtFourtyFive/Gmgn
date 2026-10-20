"""Meme cards (REPLY_BANK §5): type-only and vector layouts, no AI, no stock art.

Usage: python3 build.py scratch_dir [ref ...]
Refs: meme-1 (bingo), meme-2 (alignment), meme-4 (translator), meme-6 (wanted), meme-8 (starter pack),
      meme-9 (tier list), meme-10 (forecast). meme-3/5/7 need demo-data captures: tools/memes/capture_memes.py.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/user/Gmgn/marketing/tools")
from chips import chip_html  # noqa: E402

M = "/home/user/Gmgn/marketing"
S = sys.argv[1]
os.makedirs(S, exist_ok=True)
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("cards2", "/home/user/Gmgn/marketing/tools/cards2/build.py")
cards = importlib.util.module_from_spec(_spec)  # stage, kicker, wordmark, svg
_spec.loader.exec_module(cards)

FG, MUTED, AMBER, RED, PANEL, LINE = "#E6E9F0", "#8C94A3", "#FFB547", "#FF5468", "#11141A", "#222731"
RETICLE = ('<circle cx="16" cy="16" r="9" fill="none" stroke="#FFB547" stroke-width="1.2"/>'
           '<path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5" stroke="#FFB547" stroke-width="1.2" stroke-linecap="round"/>')


def head(title, sub, pad, tpx):
    return (f'<div style="position:absolute;left:{pad}px;right:{pad}px;top:{pad * 0.8:.0f}px">'
            f'<div style="font-weight:900;font-size:{tpx}px;letter-spacing:-.04em;line-height:1">{title}</div>'
            f'<div style="margin-top:12px;font-weight:500;font-size:{tpx * 0.36:.0f}px;color:{MUTED}">{sub}</div></div>')


def mark_only(pad, px=34):
    return f'<div style="position:absolute;right:{pad}px;bottom:{pad * 0.6:.0f}px">{cards.wordmark(px)}</div>'


def footer(text, pad, px=24):
    return (f'<div style="position:absolute;left:{pad}px;right:{pad}px;bottom:{pad * 0.6:.0f}px;display:flex;justify-content:space-between;align-items:center">'
            f'<span class="mono" style="color:{MUTED};font-weight:500;font-size:{px}px">{text}</span>{cards.wordmark(px * 1.4)}</div>')


def bingo():
    w, h = 1080, 1350
    sq = ['dev "stepping away"', '"it\'s a social experiment"', "top 10 holds half", "30 buyers in the launch block",
          '"next leg up loading"', '"just a shakeout"', "one green candle, then a cliff", "fresh wallets everywhere",
          "roadmap with 5 phases", "the group chat goes read-only", '"cto incoming"', "dev sold into the first pump",
          None, "big volume, four traders", "sell tx fails", '"support" DMs you first', "migrated, then straight down",
          "anti-mev off", "slippage at 50%", "dev wallet funded 5 min ago", "same funder, every wallet",
          "the socials link to nothing", "the caller deleted the post", '"i\'ll set a stop-loss later"', "website made in an afternoon"]
    cells = ""
    for s in sq:
        if s is None:
            cells += (f'<div style="background:#1A1408;border:3px solid {AMBER};display:flex;flex-direction:column;align-items:center;justify-content:center;'
                      f'text-align:center;padding:10px"><div class="mono" style="color:{AMBER};font-weight:700;font-size:26px;letter-spacing:.08em">FREE</div>'
                      f'<div style="margin-top:6px;font-weight:700;font-size:22px;line-height:1.15">you aped anyway</div></div>')
        else:
            cells += (f'<div style="background:{PANEL};display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;'
                      f'font-weight:600;font-size:21px;line-height:1.2">{s}</div>')
    body = (head("trench bingo", "how many squares did your last coin hit?", 80, 96)
            + f'<div style="position:absolute;left:80px;right:80px;top:300px;height:920px;display:grid;grid-template-columns:repeat(5,1fr);'
              f'grid-template-rows:repeat(5,1fr);gap:3px;background:{LINE};border:3px solid {LINE}">{cells}</div>' + mark_only(80))
    return cards.stage(w, h, body), w, h


def alignment():
    w, h = 1200, 1200
    cto = (f'<span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:7px;background:{MUTED}24;color:{MUTED};'
           f'font-weight:500;font-size:28px">CTO</span>')
    cells = [("smart", "smart money", "in early, out on schedule, never posts about it"), ("whale", "whale", "buys big and just… holds"),
             (cto, "cto crew", "rebuilding the socials at 4am"), ("sniper", "sniper", "blocks 1 to 3, sells into the first wave, every time"),
             ("fresh", "fresh wallet", "no history. no personality. no comment."), ("bot", "bot", "trading with itself every 3 seconds"),
             ("bundler", "bundler", "same block as creation, never travels alone"), ("insider", "insider", 'gas money from the dev, "just a fan"'),
             ("dev", "", "")]
    cols, rows = ["lawful", "neutral", "chaotic"], ["good", "neutral", "evil"]
    grid = ""
    for i, (tag, name, desc) in enumerate(cells):
        chip = tag if tag.startswith("<") else chip_html(tag, 28)
        if not name:  # chaotic evil: the dev, chip only
            grid += (f'<div style="background:#1A0E10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;'
                     f'border:2px solid {RED}55">{chip_html("dev", 46)}<div class="mono" style="color:{MUTED};font-size:22px">no comment needed.</div></div>')
            continue
        grid += (f'<div style="background:{PANEL};padding:22px;display:flex;flex-direction:column;gap:12px">{chip}'
                 f'<div style="font-weight:800;font-size:34px;letter-spacing:-.02em;line-height:1">{name}</div>'
                 f'<div style="font-weight:500;font-size:23px;line-height:1.25;color:#C9CED8">{desc}</div></div>')
    col_labels = "".join(f'<div class="mono" style="text-align:center;color:{AMBER};font-weight:600;font-size:22px;letter-spacing:.14em">{c.upper()}</div>' for c in cols)
    row_labels = "".join(f'<div class="mono" style="display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;transform:rotate(180deg);'
                         f'color:{AMBER};font-weight:600;font-size:22px;letter-spacing:.14em">{r.upper()}</div>' for r in rows)
    body = (head("trench alignment chart", "every wallet here is an archetype, not a person", 72, 84)
            + f'<div style="position:absolute;left:120px;right:72px;top:236px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px">{col_labels}</div>'
            + f'<div style="position:absolute;left:72px;width:40px;top:280px;bottom:120px;display:grid;grid-template-rows:repeat(3,1fr);gap:4px">{row_labels}</div>'
            + f'<div style="position:absolute;left:120px;right:72px;top:280px;bottom:120px;display:grid;grid-template-columns:repeat(3,1fr);'
              f'grid-template-rows:repeat(3,1fr);gap:4px;background:{LINE};border:4px solid {LINE}">{grid}</div>'
            + footer("high risk · nfa", 72, 22))
    return cards.stage(w, h, body), w, h


def translator():
    w, h = 1080, 1350
    rows = [('"stealth launch"', "the bundle knew first"), ('"community takeover"', "the dev left"), ('"healthy dip"', "slow rug, chapter 1"),
            ('"organic volume"', "four wallets on a loop"), ('"lp is burned, we\'re fine"', "the pool stays. the dev's bag doesn't."),
            ('"the devs are doxxed"', "a profile picture exists"), ('"the devs are building"', "the devs are selling"), ('"we\'re so early"', "you're buyer #200")]
    html = "".join(f'<div style="display:grid;grid-template-columns:44% 56%;gap:28px;padding:22px 0;border-top:2px solid {LINE};align-items:center">'
                   f'<div style="font-weight:700;font-size:34px;letter-spacing:-.015em;line-height:1.15">{a}</div>'
                   f'<div class="mono" style="color:{AMBER};font-weight:600;font-size:28px;line-height:1.3">→ {b}</div></div>' for a, b in rows)
    labels = (f'<div class="mono" style="display:grid;grid-template-columns:44% 56%;gap:28px;color:{MUTED};font-size:22px;letter-spacing:.12em;margin-bottom:10px">'
              f'<span>WHAT THEY SAY</span><span>WHAT IT USUALLY MEANS</span></div>')
    body = (head("trench translator", "what they say vs what it usually means. not about anyone in particular.", 80, 92)
            + f'<div style="position:absolute;left:80px;right:80px;top:300px">{labels}{html}</div>' + mark_only(80))
    return cards.stage(w, h, body), w, h


HOOD = ('<path d="M100 18 C 70 30, 52 62, 50 96 C 48 118, 44 132, 30 150 L 22 196 L 178 196 L 170 150 C 156 132, 152 118, 150 96 '
        'C 148 62, 130 30, 100 18 Z" fill="#1C2029" stroke="#3A4150" stroke-width="2"/>'
        '<path d="M100 44 C 80 52, 70 74, 70 98 C 70 116, 80 128, 100 132 C 120 128, 130 116, 130 98 C 130 74, 120 52, 100 44 Z" fill="#050608"/>')


def wanted():
    w, h = 1080, 1350
    fields = [("last seen", "the creation block"), ("known associates", "a dozen wallets, same block"),
              ("distinguishing marks", "holds a lot of a coin that's 3 seconds old"), ("reward", "knowing before you buy.")]
    rows = "".join(f'<div style="display:flex;gap:16px;margin-top:16px;font-size:27px;line-height:1.3"><span class="mono" style="color:{MUTED};white-space:nowrap">{k}:</span>'
                   f'<span class="mono" style="color:{AMBER if k == "reward" else FG};font-weight:{700 if k == "reward" else 500}">{v}</span></div>' for k, v in fields)
    body = (f'<div style="position:absolute;inset:40px;border:10px solid {AMBER};border-radius:6px"></div>'
            f'<div style="position:absolute;inset:62px;border:2px solid {AMBER}66;border-radius:2px"></div>'
            f'<div style="position:absolute;left:0;right:0;top:110px;text-align:center;font-weight:900;font-size:150px;letter-spacing:.04em;line-height:1">WANTED</div>'
            f'<div class="mono" style="position:absolute;left:0;right:0;top:272px;text-align:center;color:{MUTED};font-size:24px;letter-spacing:.1em">'
            f'A FICTIONAL ARCHETYPE, NOT A PERSON · PART 1 OF 4</div>'
            f'<svg style="position:absolute;left:340px;top:330px" width="400" height="400" viewBox="0 0 32 32">{RETICLE}</svg>'
            f'<svg style="position:absolute;left:390px;top:370px" width="300" height="300" viewBox="0 0 200 200">{HOOD}</svg>'
            f'<div style="position:absolute;left:0;right:0;top:760px;display:flex;justify-content:center;align-items:center;gap:26px">'
            f'<div style="font-weight:900;font-size:76px;letter-spacing:-.02em">THE BUNDLER</div>{chip_html("bundler", 40)}</div>'
            f'<div style="position:absolute;left:120px;right:120px;top:880px">{rows}</div>'
            + f'<div style="position:absolute;left:96px;right:96px;bottom:92px;display:flex;justify-content:space-between;align-items:center">'
              f'<span class="mono" style="color:{MUTED};font-size:22px">high risk · nfa</span>{cards.wordmark(30)}</div>')
    return cards.stage(w, h, body, glow="50% 40%"), w, h


def icon(kind):
    s = f'stroke="{FG}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"'
    a = f'stroke="{AMBER}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"'
    return {
        "bubble": f'<path d="M12 14h40a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H30l-12 10v-10h-6a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6z" {s}/><path d="M18 26h18M18 34h28" {a}/>',
        "notepad": f'<rect x="14" y="10" width="36" height="46" rx="4" {s}/><path d="M22 22h20M22 30h20M22 38h20M22 46h12" {s} opacity=".55"/><path d="M20 6v8M32 6v8M44 6v8" {a}/>',
        "toggle": f'<rect x="8" y="22" width="48" height="22" rx="11" {s}/><circle cx="19" cy="33" r="7" {a}/><path d="M40 33h8" {s} opacity=".5"/>',
        "eye": f'<path d="M6 32s10-16 26-16 26 16 26 16-10 16-26 16S6 32 6 32z" {s}/><circle cx="32" cy="32" r="7" {a}/>',
        "slider": f'<path d="M8 32h48" {s}/><path d="M8 32h44" {a}/><circle cx="52" cy="32" r="6" fill="{AMBER}" stroke="none"/><path d="M8 20v24M56 20v24" {s} opacity=".5"/>',
        "chat": f'<path d="M8 12h30a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5H20l-8 7v-7H8a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5z" {s}/>'
                f'<rect x="32" y="34" width="24" height="18" rx="4" {a}/><circle cx="40" cy="43" r="2" fill="{AMBER}"/><circle cx="48" cy="43" r="2" fill="{AMBER}"/><path d="M44 30v4" {a}/>',
    }[kind]


def starter():
    w, h = 1200, 1200
    tiles = [("bubble", "a ca from a stranger's reply"), ("notepad", "seed phrase saved in the notes app"), ("toggle", "anti-mev: off"),
             ("eye", '"i\'ll watch it, no stop-loss"'), ("slider", "slippage: 50%"), ("chat", "a group chat with more bots than people")]
    html = "".join(f'<div style="background:{PANEL};border:2px solid {LINE};border-radius:16px;display:flex;flex-direction:column;align-items:center;'
                   f'justify-content:center;gap:26px;padding:30px;text-align:center"><svg width="150" height="150" viewBox="0 0 64 64">{icon(k)}</svg>'
                   f'<div style="font-weight:700;font-size:34px;letter-spacing:-.015em;line-height:1.15">{t}</div></div>' for k, t in tiles)
    body = (head("trench newcomer starter pack", "we've owned every item on this card", 72, 68)
            + f'<div style="position:absolute;left:72px;right:72px;top:240px;bottom:130px;display:grid;grid-template-columns:repeat(3,1fr);'
              f'grid-template-rows:repeat(2,1fr);gap:22px">{html}</div>' + mark_only(72))
    return cards.stage(w, h, body), w, h


def tiers():
    w, h = 1200, 1200
    rows = [("S", AMBER, '"dev is based"'), ("A", "#D9A85A", '"it\'s a cto now, it\'s different"'), ("B", MUTED, '"i\'ll sell at 2x"'),
            ("C", "#D9776B", '"i\'m not selling, i\'m a believer"'), ("D", RED, '"one more coin, then i\'m done"')]
    html = "".join(f'<div style="display:grid;grid-template-columns:150px 1fr;min-height:0">'
                   f'<div style="background:{c};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:84px;color:#0A0C10">{t}</div>'
                   f'<div style="background:{PANEL};display:flex;align-items:center;padding:0 40px;font-weight:600;font-size:46px;letter-spacing:-.02em">{q}</div></div>'
                   for t, c, q in rows)
    body = (head("famous last words", "ranked by how fast they age", 72, 88)
            + f'<div style="position:absolute;left:72px;right:72px;top:260px;bottom:140px;display:grid;grid-template-rows:repeat(5,1fr);gap:10px">{html}</div>'
            + mark_only(72))
    return cards.stage(w, h, body), w, h


def wx(kind):
    cand = lambda x, y, c, hgt=14: (f'<path d="M{x} {y - 4}v{hgt + 8}" stroke="{c}" stroke-width="1.6"/>'
                                    f'<rect x="{x - 3}" y="{y}" width="6" height="{hgt}" fill="{c}" rx="1"/>')
    cloud = f'<path d="M18 40a10 10 0 0 1 2-20 14 14 0 0 1 26-2 10 10 0 0 1 4 22z" fill="#1C2029" stroke="{FG}" stroke-width="2.4" stroke-linejoin="round"/>'
    return {
        "snipers": cloud + "".join(f'<circle cx="{x}" cy="{y}" r="4" fill="none" stroke="{RED}" stroke-width="1.8"/>'
                                   f'<path d="M{x} {y - 7}v3M{x} {y + 4}v3M{x - 7} {y}h3M{x + 4} {y}h3" stroke="{RED}" stroke-width="1.8" stroke-linecap="round"/>'
                                   for x, y in ((22, 52), (38, 60), (50, 50))),
        "bundle": cloud + cand(24, 48, RED) + cand(36, 50, RED) + cand(48, 48, RED) + cand(30, 62, RED, 8) + cand(42, 62, RED, 8),
        "devsell": f'<path d="M32 8l26 46H6z" fill="#1A0E10" stroke="{RED}" stroke-width="2.6" stroke-linejoin="round"/><path d="M32 24v16" stroke="{RED}" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="47" r="2.2" fill="{RED}"/>',
        "fog": "".join(f'<path d="M{8 + (i % 2) * 6} {18 + i * 10}h{44 - (i % 2) * 8}" stroke="{MUTED}" stroke-width="3" stroke-linecap="round" opacity="{0.9 - i * 0.12}"/>' for i in range(5)),
        "drizzle": cloud + cand(22, 48, RED, 6) + cand(34, 52, RED, 6) + cand(46, 48, RED, 6) + cand(28, 60, RED, 5) + cand(40, 62, RED, 5),
        "quiet": f'<path d="M40 14a18 18 0 1 0 12 30 15 15 0 0 1-12-30z" fill="#1C2029" stroke="{MUTED}" stroke-width="2.4"/><path d="M12 54h40" stroke="{MUTED}" stroke-width="2" opacity=".5"/>',
        "cto": f'<circle cx="32" cy="30" r="10" fill="#1C2029" stroke="{AMBER}" stroke-width="2.4"/>'
               + "".join(cand(int(32 + 18 * __import__('math').cos(a)), int(30 + 18 * __import__('math').sin(a)) - 6, "#22D687", 8)
                         for a in [i * 0.785 for i in range(8)]),
    }[kind]


def forecast():
    w, h = 1600, 900
    days = [("MON", "snipers", "scattered snipers"), ("TUE", "bundle", "heavy bundling, clearing after migration"), ("WED", "devsell", "dev-sell advisory in effect"),
            ("THU", "fog", "dense fog of fresh wallets"), ("FRI", "drizzle", "slow-rug drizzle, all day"), ("SAT", "quiet", "quiet. coins go quiet."),
            ("SUN", "cto", "community takeover front moving in")]
    cols = "".join(f'<div style="background:{PANEL};border:2px solid {LINE};border-radius:14px;display:flex;flex-direction:column;align-items:center;'
                   f'justify-content:flex-start;padding:34px 14px;gap:26px;text-align:center"><div class="mono" style="color:{AMBER};font-weight:700;font-size:30px;letter-spacing:.12em">{d}</div>'
                   f'<svg width="150" height="150" viewBox="0 0 64 72">{wx(k)}</svg>'
                   f'<div style="font-weight:700;font-size:30px;line-height:1.2;letter-spacing:-.01em">{t}</div></div>' for d, k, t in days)
    body = (head("trench forecast", "this week: same as last week", 72, 84)
            + f'<div style="position:absolute;left:72px;right:72px;top:250px;bottom:140px;display:grid;grid-template-columns:repeat(7,1fr);gap:16px">{cols}</div>'
            + mark_only(72, 30))
    return cards.stage(w, h, body), w, h


def facts():
    """meme-3: a nutrition-facts label; every number from screens/live/facts.json (one capture-mode audit frame)."""
    w, h = 1080, 1350
    f = json.load(open(f"{M}/screens/live/facts.json"))["values"]
    tone = lambda v, warn, bad: RED if v >= bad else (AMBER if v >= warn else "#22D687")
    p = lambda x: float(x.rstrip("%").split()[0])
    rows = [("dev holding", f["dev"], tone(p(f["dev"]), 10, 30)), ("insiders", f["insiders"], tone(p(f["insiders"]), 5, 10)),
            ("bundlers", f'{f["bundlers"]} of volume', tone(p(f["bundlers"]), 10, 30)), ("snipers", f["snipers"], tone(int(f["snipers"].split()[0]), 5, 21)),
            ("fresh wallets", f["fresh"], tone(p(f["fresh"]), 15, 30)), ("top 10 holders", f["top10"], tone(p(f["top10"]), 30, 50)),
            ("smart money", f["smart"], AMBER if f["smart"] == "0" else "#22D687")]
    rr = "".join(f'<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #3A4150"><span style="font-weight:600">{k}</span>'
                 f'<span class="mono" style="font-weight:700;color:{c}">{v}</span></div>' for k, v, c in rows)
    label = (f'<div style="position:absolute;left:150px;right:150px;top:250px;background:{PANEL};border:6px solid {FG};padding:26px 34px;font-size:34px">'
             f'<div style="font-weight:900;font-size:86px;letter-spacing:-.03em;line-height:.95">Trench Facts</div>'
             f'<div style="border-top:3px solid {FG};margin-top:12px;padding-top:10px;font-weight:600">serving size: 1 launch · demo data</div>'
             f'<div style="font-weight:600">servings per container: {f["holders"]} holders</div>'
             f'<div style="border-top:16px solid {FG};margin-top:14px"></div>{rr}'
             f'<div style="border-top:10px solid {FG};margin-top:6px;display:flex;justify-content:space-between;padding:12px 0 6px;font-weight:900;font-size:40px">'
             f'<span>rug ratio</span><span class="mono" style="color:{RED}">{f["rugRatio"].split(".")[0]}%</span></div>'
             f'<div class="mono" style="font-weight:700;color:{RED}">audit: {f["flags"]} flags · {f["risk"].lower()} risk</div>'
             f'<div style="border-top:3px solid {FG};margin-top:16px;padding-top:12px;font-size:25px;line-height:1.35;color:#C9CED8">'
             f'ingredients: a dev, some insiders, a bundle, a lot of fresh wallets.<br><b style="color:{FG}">may contain traces of a community.</b></div></div>')
    body = (head("trench facts", "one launch · demo data · read off the audit panel", 80, 84) + label
            + f'<div style="position:absolute;left:80px;right:80px;bottom:44px;display:flex;justify-content:space-between;align-items:center">'
              f'<span class="mono" style="color:{MUTED};font-size:22px">UI shown with demo data · high risk · nfa</span>{cards.wordmark(30)}</div>')
    return cards.stage(w, h, body), w, h


BUILD = {"meme-1": bingo, "meme-3": facts, "meme-2": alignment, "meme-4": translator, "meme-6": wanted, "meme-8": starter, "meme-9": tiers, "meme-10": forecast}

if __name__ == "__main__":
    jobs = []
    for ref in (sys.argv[2:] or list(BUILD)):
        html, w, h = BUILD[ref]()
        hp = f"{S}/{ref}.html"
        open(hp, "w").write(html)
        jobs.append({"src": hp, "out": f"{M}/x/posts/{ref}.png", "width": w, "height": h, "wait": 400})
    json.dump(jobs, open(f"{S}/jobs.json", "w"), indent=1)
    subprocess.run(["node", f"{M}/tools/render.mjs", f"{S}/jobs.json"], check=True)
