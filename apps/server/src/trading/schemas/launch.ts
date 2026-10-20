// Token launch request schema (docs/API.md, "Token launch"): limits, visible-text
// and reserved-ticker rules (look-alike characters folded first) and social links.

import { z } from 'zod';
import { CHAINS, getLaunchpad, type ChainId } from '@trenchscope/shared';
import { DEFAULT_LAUNCH_GLYPH, LAUNCH_GLYPHS, RESERVED_TICKERS } from '../../sim/names';
import { chainSchema, issue, positive, presetId, strategySchema } from './common';

export const LAUNCH_LIMITS = {
  nameMaxLength: 32,
  symbolMaxLength: 10,
  descriptionMaxLength: 280,
  maxBundleWallets: 4,
  /** Creation-block buy caps (native): the dev buy plus every bundle stay far below what any curve needs to graduate. */
  maxDevBuyNative: { sol: 10, base: 0.6, robinhood: 0.6, bsc: 3, eth: 0.6 } as Record<ChainId, number>,
  maxBundleBuyNative: { sol: 5, base: 0.3, robinhood: 0.3, bsc: 1.5, eth: 0.3 } as Record<ChainId, number>,
};

/** Control, zero-width, bidi-override, lone-surrogate and line / paragraph separator characters (invisible, broken or direction-flipping text). */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
/** Stacked combining marks ("Zalgo" text spilling over neighbouring rows); real scripts need at most three. */
const STACKED_MARKS = /\p{M}{4,}/u;
const visible = (s: string) => !INVISIBLE.test(s) && !STACKED_MARKS.test(s);

/** Cyrillic, Greek and small-capital letters drawn like Latin ones (letters from Unicode's confusables). */
const LOOKALIKES: [string, string][] = [
  ['АВСЕНІЈКМОРЅТХУҮӀԚԜѴ', 'ABCEHIJKMOPSTXYYIQWV'],
  ['аеорсухіјѕһԁԛԝӏүѵ', 'aeopcyxijshdqwlyv'],
  ['ΑΒΕΖΗΙΚΜΝΟΡΤΥΧϹͿ', 'ABEZHIKMNOPTYXCJ'],
  ['αικνορυχϲϳ', 'aikvopuxcj'],
  ['ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ', 'ABCDEFGHIJKLMNOPRSTUVWYZ'],
];
const LATIN_OF = new Map(LOOKALIKES.flatMap(([from, to]) => [...from].map((c, i): [string, string] => [c, to[i]])));
const LOOKALIKE = new RegExp(`[${[...LATIN_OF.keys()].join('')}]`, 'gu');

/**
 * The Latin text a string reads as: compatibility forms (full-width, math alphanumerics,
 * ligatures) decomposed, accents dropped, Cyrillic / Greek look-alikes swapped for Latin.
 */
export function foldConfusables(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(LOOKALIKE, (c) => LATIN_OF.get(c)!);
}

/** A name or symbol that reads as a reserved ticker once folded, ignoring case, spaces and punctuation ("Ｓ.О.Ｌ" = SOL). */
export const isReservedTicker = (s: string) => RESERVED_TICKERS.has(foldConfusables(s).toUpperCase().replace(/[^A-Z0-9]/g, ''));

/** An https link (on one of `hosts` when given), canonicalized; blank means "none". */
function socialLink(hosts: string[] | null) {
  const link = z
    .string()
    .trim()
    .max(200, 'link is too long')
    .refine(
      (raw) => {
        if (!URL.canParse(raw)) return false;
        const url = new URL(raw);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        return url.protocol === 'https:' && !url.username && !url.password && host.includes('.') && (!hosts || hosts.includes(host));
      },
      hosts ? `must be an https link on ${hosts.join(' or ')}` : 'must be an https link',
    )
    .transform((raw) => new URL(raw).href);
  return z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), link.optional());
}

export const launchSchema = z
  .object({
    chain: chainSchema,
    launchpad: z.string().trim().min(1, 'launchpad is required').max(40),
    name: z
      .string()
      .trim()
      .min(1, 'name is required')
      .max(LAUNCH_LIMITS.nameMaxLength)
      .refine(visible, 'name contains control, invisible or stacked characters')
      .refine((s) => !isReservedTicker(s), 'this name is reserved'),
    symbol: z
      .string()
      .trim()
      .transform((s) => s.replace(/^\$/, '').toUpperCase())
      // before the A-Z0-9 rule, so a look-alike of a reserved ticker is refused as reserved
      .refine((s) => !isReservedTicker(s), 'this ticker is reserved')
      .pipe(z.string().regex(new RegExp(`^[A-Z0-9]{1,${LAUNCH_LIMITS.symbolMaxLength}}$`), `must be 1-${LAUNCH_LIMITS.symbolMaxLength} letters or digits`)),
    description: z
      .string()
      .trim()
      .transform((s) => s.replace(/\r\n?/g, '\n'))
      .pipe(z.string().max(LAUNCH_LIMITS.descriptionMaxLength))
      .refine((s) => visible(s.replace(/\n/g, '')), 'description contains control, invisible or stacked characters')
      .default(''),
    socials: z.object({ twitter: socialLink(['x.com', 'twitter.com']), telegram: socialLink(['t.me', 'telegram.me']), website: socialLink(null) }).default({}),
    logoGlyph: z
      .string()
      .refine((g) => LAUNCH_GLYPHS.has(g), 'not an allowed glyph (see /api/launch/config)')
      .default(DEFAULT_LAUNCH_GLYPH),
    devBuyNative: z.number().finite().min(0),
    bundleWallets: z.number().int().min(0).max(LAUNCH_LIMITS.maxBundleWallets).default(0),
    bundleBuyNative: positive.optional(),
    presetId: presetId.optional(),
    strategy: strategySchema.optional(),
  })
  .superRefine((l, ctx) => {
    const unit = CHAINS[l.chain].nativeSymbol;
    if (getLaunchpad(l.launchpad)?.chain !== l.chain) issue(ctx, 'launchpad', `unknown launchpad ${l.launchpad} on ${l.chain}`);
    if (l.devBuyNative > LAUNCH_LIMITS.maxDevBuyNative[l.chain]) issue(ctx, 'devBuyNative', `at most ${LAUNCH_LIMITS.maxDevBuyNative[l.chain]} ${unit}`);
    if (l.bundleWallets > 0 && l.bundleBuyNative === undefined) issue(ctx, 'bundleBuyNative', 'required with bundleWallets');
    // bundle wallets only ever sell alongside the dev wallet (Launches.followSell): without a dev bag they could never exit
    if (l.bundleWallets > 0 && !(l.devBuyNative > 0)) issue(ctx, 'bundleWallets', 'bundle wallets sell with the dev buy, so they need one');
    if (l.bundleBuyNative !== undefined && l.bundleBuyNative > LAUNCH_LIMITS.maxBundleBuyNative[l.chain]) {
      issue(ctx, 'bundleBuyNative', `at most ${LAUNCH_LIMITS.maxBundleBuyNative[l.chain]} ${unit} per bundle wallet`);
    }
    if (l.strategy && !(l.devBuyNative > 0)) issue(ctx, 'strategy', 'exit strategies need a dev buy');
  });

export type LaunchInput = z.output<typeof launchSchema>;
