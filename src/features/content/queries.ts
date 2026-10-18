import { loadContent } from './source';
import type { Block, ContentBundle } from './schemas';
import { envHeroVariant, resolveHeroVariant, site, type HeroVariant } from '../../config/site';

export { loadContent };

export async function getSiteSettings(): Promise<{ brandName: string; tagline: string; heroVariant: HeroVariant; settings: ContentBundle['settings'] }> {
  const c = await loadContent();
  return {
    brandName: c.settings.brandName ?? site.brandName,
    tagline: c.settings.tagline ?? site.tagline,
    heroVariant: c.settings.homepageHeroVariant ? resolveHeroVariant(c.settings.homepageHeroVariant) : envHeroVariant(),
    settings: c.settings,
  };
}

export async function findBySlug<K extends 'destinations' | 'essentials' | 'articles' | 'places' | 'guides' | 'pages'>(
  kind: K,
  slug: string,
): Promise<ContentBundle[K][number] | undefined> {
  const c = await loadContent();
  return (c[kind] as { slug: string }[]).find((d) => d.slug === slug) as ContentBundle[K][number] | undefined;
}

export function hasTodos(blocks: Block[]): boolean {
  return blocks.some((b) => b.type === 'todo');
}

export function formatUpdated(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Tirane' }).format(new Date(date));
}
