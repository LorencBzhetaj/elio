import { createClient, type SanityClient } from '@sanity/client';
import { contentBundle, type ContentBundle } from './schemas';
import { fixtures } from '../../content/fixtures';

/**
 * Loads PUBLISHED editorial content. Uses Sanity when SANITY_PROJECT_ID is configured, otherwise the
 * local sample fixtures. Content is validated with the same zod schema either way, so an invalid CMS
 * document fails the build instead of rendering broken pages.
 */
function env(name: string): string | undefined {
  const v = (typeof process !== 'undefined' ? process.env[name] : undefined) ?? ((import.meta as { env?: Record<string, string | undefined> }).env ?? {})[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function sanityConfigured(): boolean {
  return Boolean(env('SANITY_PROJECT_ID'));
}

let client: SanityClient | undefined;
function sanity(): SanityClient {
  client ??= createClient({
    projectId: env('SANITY_PROJECT_ID')!,
    dataset: env('SANITY_DATASET') ?? 'production',
    apiVersion: env('SANITY_API_VERSION') ?? '2026-10-01',
    useCdn: true,
    perspective: 'published', // drafts never reach the public site or search
    token: env('SANITY_READ_TOKEN'),
  });
  return client;
}

/** Projections only select public fields. Unknown fields are stripped by zod anyway. */
const IMAGE = `{ "src": asset->url, "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height,
  alt, credit, rights, scene, needed, "focal": select(defined(hotspot) => { "x": hotspot.x, "y": hotspot.y }) }`;
const BLOCKS = `{ "type": _type, text, items }`;
const BASE = `"slug": slug.current, title, summary, verified, "updatedAt": coalesce(_updatedAt, now()), "status": "published", canonical, seoDescription`;

const QUERY = `{
  "destinations": *[_type == "destination" && defined(slug.current)]{ ${BASE}, kicker, region, types, interests,
    "cover": cover${IMAGE}, "gallery": gallery[]${IMAGE}, highlights,
    "whenToGo": whenToGo[]${BLOCKS}, "howToArrive": howToArrive[]${BLOCKS}, "thingsToDo": thingsToDo[]${BLOCKS},
    "placeSlugs": places[]->slug.current, "relatedGuideProductId": relatedGuide->productSlug,
    "relatedArticleSlugs": relatedArticles[]->slug.current, featured },
  "essentials": *[_type == "essential" && defined(slug.current)]{ ${BASE}, icon, "body": body[]${BLOCKS} },
  "articles": *[_type == "article" && defined(slug.current)]{ ${BASE}, category, readingMinutes, author,
    "cover": cover${IMAGE}, "body": body[]${BLOCKS}, "destinationSlugs": destinations[]->slug.current, "relatedGuideProductId": relatedGuide->productSlug },
  "places": *[_type == "place" && defined(slug.current)]{ ${BASE}, kind, "destinationSlug": destination->slug.current,
    "cover": cover${IMAGE}, "access": access[]${BLOCKS}, light, safety, permissions, coordinates, "relatedGuideProductId": relatedGuide->productSlug },
  "events": *[_type == "event" && defined(slug.current)]{ ${BASE}, "destinationSlug": destination->slug.current, venue,
    start, end, allDay, timezone, organizerUrl, sourceUrl, lastCheckedAt },
  "guides": *[_type == "guideMarketing" && defined(slug.current)]{ ${BASE}, productSlug, subtitle, "cover": cover${IMAGE},
    "destinationSlugs": destinations[]->slug.current, contents, "samplePages": samplePages[]{ title, caption, "image": image${IMAGE} },
    format, language, onlineOffline, updatePolicy, faq, availability },
  "pages": *[_type == "page" && defined(slug.current)]{ ${BASE}, "body": body[]${BLOCKS}, requiresLegalReview },
  "settings": *[_type == "siteSettings"][0]{ brandName, tagline, homepageHeroVariant,
    "heroCollage": heroCollage{ heading, description, "media": media[]${IMAGE} },
    "heroPanorama": heroPanorama{ heading, description, "media": media[]${IMAGE} } }
}`;

function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((v) => v !== null).map(stripNulls) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== null) out[k] = stripNulls(v);
    return out as T;
  }
  return value;
}

let cache: { at: number; data: ContentBundle } | undefined;
const TTL_MS = 60_000;

export async function loadContent(): Promise<ContentBundle> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  let raw: unknown;
  if (sanityConfigured()) {
    const result = await sanity().fetch(QUERY);
    // Place coordinates are allowed to be null; keep them.
    raw = { ...stripNulls(result), places: (result.places ?? []).map((p: Record<string, unknown>) => ({ ...stripNulls(p), coordinates: p.coordinates ?? null })) };
    if (!(raw as { settings?: unknown }).settings) (raw as Record<string, unknown>).settings = fixtures.settings;
  } else {
    raw = fixtures;
  }
  const data = contentBundle.parse(raw);
  // Only published, non-archived documents are public.
  const live = <T extends { status: string }>(list: T[]) => list.filter((d) => d.status === 'published');
  const filtered: ContentBundle = {
    ...data,
    destinations: live(data.destinations),
    essentials: live(data.essentials),
    articles: live(data.articles),
    places: live(data.places),
    events: live(data.events),
    guides: live(data.guides),
    pages: live(data.pages),
  };
  assertUniqueSlugs(filtered);
  cache = { at: Date.now(), data: filtered };
  return filtered;
}

export function assertUniqueSlugs(bundle: ContentBundle) {
  const lists: [string, { slug: string }[]][] = [
    ['destination', bundle.destinations], ['essential', bundle.essentials], ['article', bundle.articles],
    ['place', bundle.places], ['event', bundle.events], ['guide', bundle.guides], ['page', bundle.pages],
  ];
  for (const [type, list] of lists) {
    const seen = new Set<string>();
    for (const item of list) {
      if (seen.has(item.slug)) throw new Error(`Duplicate ${type} slug: ${item.slug}`);
      seen.add(item.slug);
    }
  }
}
