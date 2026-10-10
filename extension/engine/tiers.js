// @ts-check
// Tier lookup over the seed taxonomy (engine notes §3). Pure: the seed is passed in.

/** @typedef {'green'|'yellow'|'red'} SeedTier */
/** @typedef {SeedTier|'unknown'} Tier */
/** @typedef {'work'|'learning'|'personal'} Mode */
/** @typedef {{tier: SeedTier, mode: Mode, title: string}} LabelDef */
/** @typedef {{label: string, tier?: SeedTier, mode?: Mode, keywords?: string[]}} DomainDef */
/** @typedef {{version: number, labels: Record<string, LabelDef>, domains: Record<string, DomainDef>}} Seed */
/** @typedef {{domain: string, label: string, tier: SeedTier, mode: Mode, title: string}} HostMatch */
/** @typedef {{tier: SeedTier, related: boolean}} TierHint */

/**
 * R20: lowercase, strip a port, drop a leading "www." and a trailing dot.
 * @param {string|null|undefined} host
 * @returns {string}
 */
export function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
}

/**
 * Longest-suffix match: `news.google.com` beats `google.com`.
 * @param {string|null|undefined} host
 * @param {Seed} seed
 * @returns {HostMatch|null}
 */
export function matchHost(host, seed) {
  const h = normalizeHost(host);
  if (!h) return null;
  const parts = h.split('.');
  for (let i = 0; i < parts.length; i++) {
    const domain = parts.slice(i).join('.');
    if (!Object.hasOwn(seed.domains, domain)) continue;
    const d = seed.domains[domain];
    const l = seed.labels[d.label];
    return { domain, label: d.label, tier: d.tier ?? l.tier, mode: d.mode ?? l.mode, title: l.title };
  }
  return null;
}

/**
 * The key a host is stored under in ctx.resources / ctx.relatedHosts: the seed domain if any, else the host.
 * @param {string} host
 * @param {Seed} seed
 */
export function keyOf(host, seed) {
  return matchHost(host, seed)?.domain ?? normalizeHost(host);
}

/**
 * Order (engine notes §3, after the adapter's sensitive check): context rule → seed → AI hint → unknown.
 * @param {string|null|undefined} host
 * @param {{relatedHosts: string[]}|null} ctx
 * @param {Seed} seed
 * @param {Record<string, TierHint>} [hints]
 * @returns {Tier}
 */
export function tierOf(host, ctx, seed, hints) {
  const h = normalizeHost(host);
  if (!h) return 'unknown';
  if (ctx && ctx.relatedHosts.some((r) => h === r || h.endsWith('.' + r))) return 'green';
  const m = matchHost(h, seed);
  if (m) return m.tier;
  const hint = hints && Object.hasOwn(hints, h) ? hints[h] : null;
  if (hint) return hint.related ? 'green' : hint.tier;
  return 'unknown';
}
