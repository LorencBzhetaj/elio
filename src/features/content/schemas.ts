import { z } from 'zod';

/**
 * Public editorial content contract. Mirrors the Sanity schemas in /cms/schemaTypes.
 * NOTHING in here may hold paid/private data: premium coordinates, private file keys and
 * authoritative prices live only in PostgreSQL.
 */
export const sceneKinds = ['coast', 'mountains', 'town', 'lake', 'city', 'beach', 'sunset', 'food'] as const;

export const focalPoint = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const imageRef = z.object({
  /** Optimised public URL. Absent until a licensed photo is supplied. */
  src: z.string().optional(),
  /** Separate mobile crop (optional). */
  srcMobile: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.string().min(1, 'Image alt text is required'),
  credit: z.string().optional(),
  rights: z.enum(['licensed', 'owned', 'placeholder']).default('placeholder'),
  focal: focalPoint.optional(),
  focalMobile: focalPoint.optional(),
  /** Illustration used while no licensed photo exists. */
  scene: z.enum(sceneKinds).default('coast'),
  /** Short description of the photo we still need, shown to editors. */
  needed: z.string().optional(),
});
export type ImageRef = z.infer<typeof imageRef>;

/**
 * A public map location. `verified` stays false until an editor has checked it on the ground or
 * against an authoritative source; unverified points are only shown while PUBLIC_MAP_SHOW_UNVERIFIED is on.
 */
export const geoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  precision: z.enum(['exact', 'town-centre', 'area']).default('exact'),
  verified: z.boolean().default(false),
});
export type GeoPoint = z.infer<typeof geoPoint>;

/** Alternative spellings people search for (e.g. Thethi, Shkodra). */
const aliases = z.array(z.string().min(1)).default([]);

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase-kebab-case');

const editorial = {
  slug,
  title: z.string().min(1),
  summary: z.string().min(1),
  /** False until an editor has checked every factual statement. Shown as a "facts to verify" chip. */
  verified: z.boolean().default(false),
  updatedAt: z.string(),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  canonical: z.url().optional(),
  seoDescription: z.string().optional(),
};

/** Portable, minimal rich text: headings, paragraphs and lists. */
export const block = z.discriminatedUnion('type', [
  z.object({ type: z.literal('h2'), text: z.string() }),
  z.object({ type: z.literal('h3'), text: z.string() }),
  z.object({ type: z.literal('p'), text: z.string() }),
  z.object({ type: z.literal('ul'), items: z.array(z.string()) }),
  z.object({ type: z.literal('todo'), text: z.string() }),
]);
export type Block = z.infer<typeof block>;

export const regions = ['north', 'central', 'south', 'coast'] as const;
export const destinationTypes = ['mountains', 'coast', 'historic-town', 'city', 'lake', 'nature'] as const;
export const interestTags = ['beaches', 'nature', 'hiking', 'culture', 'food', 'historic-towns', 'photography', 'hidden-gems'] as const;

export const destination = z.object({
  ...editorial,
  kicker: z.string(),
  region: z.enum(regions),
  types: z.array(z.enum(destinationTypes)).min(1),
  interests: z.array(z.enum(interestTags)).default([]),
  cover: imageRef,
  gallery: z.array(imageRef).default([]),
  highlights: z.array(z.string()).default([]),
  whenToGo: z.array(block).default([]),
  howToArrive: z.array(block).default([]),
  thingsToDo: z.array(block).default([]),
  /** Free, public places. Premium places are never stored in the CMS. */
  placeSlugs: z.array(slug).default([]),
  relatedGuideProductId: z.string().optional(),
  relatedArticleSlugs: z.array(slug).default([]),
  featured: z.boolean().default(false),
  aliases,
  location: geoPoint.optional(),
});
export type Destination = z.infer<typeof destination>;

export const essential = z.object({
  ...editorial,
  icon: z.enum(['bus', 'bag', 'wifi-off', 'sun', 'info', 'compass']).default('info'),
  body: z.array(block),
});
export type Essential = z.infer<typeof essential>;

export const articleCategories = ['itineraries', 'tips', 'food', 'culture', 'nature'] as const;
export const article = z.object({
  ...editorial,
  category: z.enum(articleCategories),
  readingMinutes: z.number().int().positive().optional(),
  author: z.string(),
  cover: imageRef,
  body: z.array(block),
  destinationSlugs: z.array(slug).default([]),
  relatedGuideProductId: z.string().optional(),
});
export type Article = z.infer<typeof article>;

export const place = z.object({
  ...editorial,
  kind: z.enum(['photo-spot', 'viewpoint', 'beach', 'landmark']).default('photo-spot'),
  destinationSlug: slug.optional(),
  cover: imageRef,
  access: z.array(block).default([]),
  light: z.string().optional(),
  safety: z.string().optional(),
  permissions: z.string().optional(),
  /** Public coordinates for FREE spots only. Null until verified. */
  coordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().default(null),
  relatedGuideProductId: z.string().optional(),
  aliases,
});
export type Place = z.infer<typeof place>;

export const event = z
  .object({
    ...editorial,
    destinationSlug: slug.optional(),
    venue: z.string().optional(),
    /** ISO 8601 with offset, or YYYY-MM-DD for all-day events (interpreted in Europe/Tirane). */
    start: z.string(),
    end: z.string().optional(),
    allDay: z.boolean().default(false),
    timezone: z.literal('Europe/Tirane').default('Europe/Tirane'),
    organizerUrl: z.url(),
    sourceUrl: z.url(),
    lastCheckedAt: z.string(),
    location: geoPoint.optional(),
  })
  .refine((e) => !e.end || e.end >= e.start, { message: 'Event end must be after start', path: ['end'] });
export type TravelEvent = z.infer<typeof event>;

export const guideMarketing = z.object({
  ...editorial,
  /** Immutable reference to products.id / products.slug in PostgreSQL. */
  productSlug: slug,
  subtitle: z.string(),
  cover: imageRef,
  destinationSlugs: z.array(slug).default([]),
  contents: z.array(z.object({ title: z.string(), description: z.string() })).default([]),
  samplePages: z.array(z.object({ title: z.string(), caption: z.string(), image: imageRef })).default([]),
  format: z.string(),
  language: z.string().default('English'),
  onlineOffline: z.string(),
  updatePolicy: z.string(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  /** Marketing state: shows "in production" when the real guide file is not ready yet. */
  availability: z.enum(['in-production', 'available']).default('in-production'),
});
export type GuideMarketing = z.infer<typeof guideMarketing>;

export const siteSettings = z.object({
  brandName: z.string().optional(),
  tagline: z.string().optional(),
  homepageHeroVariant: z.enum(['collage', 'panorama']).optional(),
  /** Editorially chosen search shortcuts shown when the search field is empty (not usage statistics). */
  suggestedSearches: z.array(z.string().min(1)).default([]),
  heroCollage: z.object({ heading: z.string(), description: z.string(), media: z.array(imageRef).min(3) }),
  heroPanorama: z.object({ heading: z.string(), description: z.string(), media: z.array(imageRef).min(1) }),
});
export type SiteSettings = z.infer<typeof siteSettings>;

export const page = z.object({
  ...editorial,
  body: z.array(block),
  /** Legal pages must be reviewed before live selling. */
  requiresLegalReview: z.boolean().default(false),
});
export type Page = z.infer<typeof page>;

export const contentBundle = z.object({
  destinations: z.array(destination),
  essentials: z.array(essential),
  articles: z.array(article),
  places: z.array(place),
  events: z.array(event),
  guides: z.array(guideMarketing),
  pages: z.array(page),
  settings: siteSettings,
});
export type ContentBundle = z.infer<typeof contentBundle>;
