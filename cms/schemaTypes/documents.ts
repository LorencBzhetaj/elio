import { defineField, defineType } from 'sanity';
import { aliasesField, bodyBlocks, editorialFields, geoPointField } from './shared';

const regions = ['north', 'central', 'south', 'coast'];
const destinationTypes = ['mountains', 'coast', 'historic-town', 'city', 'lake', 'nature'];
const interests = ['beaches', 'nature', 'hiking', 'culture', 'food', 'historic-towns', 'photography', 'hidden-gems'];
const guideRef = (title = 'Related guide') => defineField({ name: 'relatedGuide', title, type: 'reference', to: [{ type: 'guideMarketing' }] });

export const destination = defineType({
  name: 'destination',
  title: 'Destination',
  type: 'document',
  fields: [
    ...editorialFields,
    defineField({ name: 'kicker', title: 'Kicker (e.g. “Albanian Alps”)', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'region', type: 'string', options: { list: regions }, validation: (r) => r.required() }),
    defineField({ name: 'types', type: 'array', of: [{ type: 'string' }], options: { list: destinationTypes }, validation: (r) => r.required().min(1) }),
    defineField({ name: 'interests', type: 'array', of: [{ type: 'string' }], options: { list: interests } }),
    defineField({ name: 'cover', type: 'mediaImage', validation: (r) => r.required() }),
    defineField({ name: 'gallery', type: 'array', of: [{ type: 'mediaImage' }] }),
    defineField({ name: 'highlights', type: 'array', of: [{ type: 'string' }] }),
    bodyBlocks('whenToGo', 'When to go'),
    bodyBlocks('howToArrive', 'How to get there'),
    bodyBlocks('thingsToDo', 'Things to do'),
    defineField({ name: 'places', title: 'Free places / photo spots', type: 'array', of: [{ type: 'reference', to: [{ type: 'place' }] }] }),
    guideRef(),
    defineField({ name: 'relatedArticles', type: 'array', of: [{ type: 'reference', to: [{ type: 'article' }] }] }),
    defineField({ name: 'featured', title: 'Feature on homepage', type: 'boolean', initialValue: false }),
    aliasesField,
    geoPointField(),
  ],
  preview: { select: { title: 'title', subtitle: 'kicker', media: 'cover' } },
});

export const essential = defineType({
  name: 'essential',
  title: 'Essential',
  type: 'document',
  fields: [
    ...editorialFields,
    defineField({ name: 'icon', type: 'string', options: { list: ['bus', 'bag', 'wifi-off', 'sun', 'info', 'compass'] }, initialValue: 'info' }),
    bodyBlocks(),
  ],
});

export const article = defineType({
  name: 'article',
  title: 'Journal article',
  type: 'document',
  fields: [
    ...editorialFields,
    defineField({ name: 'category', type: 'string', options: { list: ['itineraries', 'tips', 'food', 'culture', 'nature'] }, validation: (r) => r.required() }),
    defineField({ name: 'readingMinutes', type: 'number', validation: (r) => r.integer().positive() }),
    defineField({ name: 'author', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'cover', type: 'mediaImage', validation: (r) => r.required() }),
    bodyBlocks(),
    defineField({ name: 'destinations', type: 'array', of: [{ type: 'reference', to: [{ type: 'destination' }] }] }),
    guideRef(),
  ],
  preview: { select: { title: 'title', subtitle: 'category', media: 'cover' } },
});

export const place = defineType({
  name: 'place',
  title: 'Place / photo spot (free)',
  type: 'document',
  description: 'Free, public places only. Premium-only spots and their coordinates belong in the paid guide, not here.',
  fields: [
    ...editorialFields,
    defineField({ name: 'kind', type: 'string', options: { list: ['photo-spot', 'viewpoint', 'beach', 'landmark'] }, initialValue: 'photo-spot' }),
    defineField({ name: 'destination', type: 'reference', to: [{ type: 'destination' }] }),
    defineField({ name: 'cover', type: 'mediaImage', validation: (r) => r.required() }),
    bodyBlocks('access', 'Access'),
    defineField({ name: 'light', title: 'Best light', type: 'string' }),
    defineField({ name: 'safety', type: 'string' }),
    defineField({ name: 'permissions', type: 'string' }),
    defineField({ name: 'coordinates', title: 'Public coordinates (verified, free spots only)', type: 'object', fields: [
      { name: 'lat', type: 'number', validation: (r) => r.required().min(-90).max(90) },
      { name: 'lng', type: 'number', validation: (r) => r.required().min(-180).max(180) },
    ] }),
    aliasesField,
    guideRef(),
  ],
});

export const event = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  description: 'Only publish events with a named organiser and a source. Dates are Europe/Tirane.',
  fields: [
    ...editorialFields,
    defineField({ name: 'destination', type: 'reference', to: [{ type: 'destination' }] }),
    defineField({ name: 'venue', type: 'string' }),
    defineField({ name: 'allDay', type: 'boolean', initialValue: true }),
    defineField({ name: 'start', title: 'Start (YYYY-MM-DD, or date-time with offset)', type: 'string', validation: (r) => r.required().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z))?$/) }),
    defineField({
      name: 'end',
      title: 'End (optional, same format)',
      type: 'string',
      validation: (r) =>
        r.regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z))?$/).custom((end, ctx) => {
          const start = (ctx.document as { start?: string } | undefined)?.start;
          return !end || !start || end >= start ? true : 'End must be after start';
        }),
    }),
    defineField({ name: 'timezone', type: 'string', initialValue: 'Europe/Tirane', readOnly: true }),
    defineField({ name: 'organizerUrl', title: 'Organiser URL', type: 'url', validation: (r) => r.required() }),
    defineField({ name: 'sourceUrl', title: 'Source URL', type: 'url', validation: (r) => r.required() }),
    defineField({ name: 'lastCheckedAt', title: 'Last checked', type: 'date', validation: (r) => r.required() }),
    geoPointField('location', 'Event location (optional)'),
  ],
});

export const guideMarketing = defineType({
  name: 'guideMarketing',
  title: 'Guide page (marketing)',
  type: 'document',
  description: 'Marketing copy only. Price, files and map links are managed in the commerce database by product slug.',
  fields: [
    ...editorialFields,
    defineField({ name: 'productSlug', title: 'Commerce product slug (immutable)', type: 'string', validation: (r) => r.required().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), readOnly: ({ document }) => Boolean(document?._createdAt && document?.productSlug) }),
    defineField({ name: 'subtitle', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'cover', type: 'mediaImage', validation: (r) => r.required() }),
    defineField({ name: 'destinations', type: 'array', of: [{ type: 'reference', to: [{ type: 'destination' }] }] }),
    defineField({ name: 'contents', title: 'What’s inside', type: 'array', of: [{ type: 'object', fields: [{ name: 'title', type: 'string' }, { name: 'description', type: 'string' }] }] }),
    defineField({ name: 'samplePages', type: 'array', of: [{ type: 'object', fields: [{ name: 'title', type: 'string' }, { name: 'caption', type: 'string' }, { name: 'image', type: 'mediaImage' }] }] }),
    defineField({ name: 'format', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'language', type: 'string', initialValue: 'English' }),
    defineField({ name: 'onlineOffline', title: 'Online / offline explanation', type: 'text', rows: 2, validation: (r) => r.required() }),
    defineField({ name: 'updatePolicy', type: 'text', rows: 2, validation: (r) => r.required() }),
    defineField({ name: 'faq', type: 'array', of: [{ type: 'object', fields: [{ name: 'q', type: 'string' }, { name: 'a', type: 'text' }] }] }),
    defineField({ name: 'availability', type: 'string', options: { list: ['in-production', 'available'] }, initialValue: 'in-production' }),
  ],
});

export const page = defineType({
  name: 'page',
  title: 'Page / policy',
  type: 'document',
  fields: [
    ...editorialFields,
    defineField({ name: 'requiresLegalReview', title: 'Legal page (shows “draft” notice until verified)', type: 'boolean', initialValue: false }),
    bodyBlocks(),
  ],
});

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  fields: [
    defineField({ name: 'brandName', title: 'Brand name (provisional until confirmed)', type: 'string' }),
    defineField({ name: 'tagline', type: 'string' }),
    defineField({
      name: 'homepageHeroVariant',
      title: 'Homepage hero (public)',
      type: 'string',
      options: { list: [{ title: 'A — Editorial collage', value: 'collage' }, { title: 'B — Panorama', value: 'panorama' }], layout: 'radio' },
      description: 'Changes the public homepage. Both are always available on /preview for comparison.',
    }),
    defineField({
      name: 'suggestedSearches',
      title: 'Suggested searches (shown when the search box is empty)',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Editorial picks, not statistics. Keep to 4–8 short terms.',
      validation: (r) => r.max(8),
    }),
    defineField({ name: 'heroCollage', title: 'Hero A — collage', type: 'object', fields: [
      { name: 'heading', type: 'string', initialValue: 'Postcards from Albania', validation: (r) => r.required() },
      { name: 'description', type: 'text', rows: 2, validation: (r) => r.required() },
      { name: 'media', title: 'Tiles (3–6, portrait and landscape mix)', type: 'array', of: [{ type: 'mediaImage' }], validation: (r) => r.required().min(3).max(6) },
    ] }),
    defineField({ name: 'heroPanorama', title: 'Hero B — panorama', type: 'object', fields: [
      { name: 'heading', type: 'string', initialValue: 'Your Albania story starts here.', validation: (r) => r.required() },
      { name: 'description', type: 'text', rows: 2, validation: (r) => r.required() },
      { name: 'media', title: 'Panorama (set hotspot as focal point)', type: 'array', of: [{ type: 'mediaImage' }], validation: (r) => r.required().min(1).max(1) },
    ] }),
  ],
});
