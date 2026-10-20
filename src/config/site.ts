/**
 * Public, build-safe site settings. Brand and domain are NOT final:
 * everything here is configurable through PUBLIC_* env vars or the CMS SiteSettings document.
 */
export type HeroVariant = 'collage' | 'panorama';

/** Astro inlines import.meta.env at build; plain Node scripts (worker, seed) only have process.env. */
const env: Record<string, string | undefined> = {
  ...(typeof process !== 'undefined' ? process.env : {}),
  ...((import.meta as { env?: Record<string, string | undefined> }).env ?? {}),
};

function pick(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

export const site = {
  /** Provisional working title seen in the reference mockups. Not a confirmed brand. */
  brandName: pick(env.PUBLIC_BRAND_NAME, 'Albania Decoded'),
  tagline: pick(
    env.PUBLIC_BRAND_TAGLINE,
    'Know where to go. Know what’s worth it. Travel Albania like you already know it.',
  ),
  supportEmail: pick(env.PUBLIC_SUPPORT_EMAIL, 'support@example.invalid'),
  siteUrl: pick(env.SITE, 'http://localhost:4321'),
  /** Shown as a small banner on every page until the owner turns it off for launch. */
  showDraftBanner: pick(env.PUBLIC_SHOW_DRAFT_BANNER, 'true') === 'true',
  locale: 'en',
  timezone: 'Europe/Tirane',
} as const;

export function resolveHeroVariant(value: string | undefined | null): HeroVariant {
  return value === 'collage' ? 'collage' : 'panorama';
}

/**
 * Production homepage hero, read at request time. Client selection changes this setting
 * (env HOMEPAGE_HERO_VARIANT or CMS SiteSettings.homepageHeroVariant), never the code.
 */
export function envHeroVariant(): HeroVariant {
  return resolveHeroVariant(
    (typeof process !== 'undefined' ? process.env.HOMEPAGE_HERO_VARIANT : undefined) ??
      env.HOMEPAGE_HERO_VARIANT,
  );
}

export const mainNav = [
  { href: '/destinations', label: 'Destinations' },
  { href: '/map', label: 'Map' },
  { href: '/essentials', label: 'Essentials' },
  { href: '/photo-spots', label: 'Photo spots' },
  { href: '/journal', label: 'Journal' },
  { href: '/events', label: 'Events' },
  { href: '/guides', label: 'Guides' },
] as const;

export const secondaryNav = [
  { href: '/plan', label: 'Plan a trip' },
  { href: '/my-trip', label: 'My trip' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export const legalNav = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/refund-policy', label: 'Refund policy' },
] as const;
