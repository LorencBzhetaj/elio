import { defineArrayMember, defineField, defineType } from 'sanity';

/**
 * Shared field helpers. These mirror src/features/content/schemas.ts in the website; keep both in sync.
 * PUBLIC CONTENT ONLY: never store paid coordinates, private file links or prices here — those live in
 * the commerce database.
 */
export const sceneOptions = ['coast', 'mountains', 'town', 'lake', 'city', 'beach', 'sunset', 'food'];

export const mediaImage = defineType({
  name: 'mediaImage',
  title: 'Image',
  type: 'image',
  options: { hotspot: true },
  fields: [
    defineField({
      name: 'alt',
      title: 'Alt text',
      type: 'string',
      description: 'Describe what the photo shows for people who cannot see it. Required.',
      validation: (r) => r.required().min(3),
    }),
    defineField({ name: 'credit', title: 'Credit / photographer', type: 'string' }),
    defineField({
      name: 'rights',
      title: 'Usage rights',
      type: 'string',
      options: { list: ['licensed', 'owned', 'placeholder'], layout: 'radio' },
      initialValue: 'licensed',
      validation: (r) =>
        r.required().custom((value, ctx) => {
          const parent = ctx.parent as { asset?: unknown } | undefined;
          if (parent?.asset && value === 'placeholder') return 'An uploaded photo must be licensed or owned.';
          return true;
        }),
      description: 'Only publish photos you own or have a licence for. Reference mockups are NOT licensed photos.',
    }),
    defineField({
      name: 'scene',
      title: 'Fallback illustration',
      type: 'string',
      options: { list: sceneOptions },
      initialValue: 'coast',
      description: 'Shown until a photo is uploaded.',
    }),
    defineField({ name: 'needed', title: 'Photo still needed (editor note)', type: 'string' }),
  ],
});

/** Simple structured body: paragraphs, headings, lists and "content to come" notes. */
export const bodyBlocks = (name = 'body', title = 'Body') =>
  defineField({
    name,
    title,
    type: 'array',
    of: [
      defineArrayMember({ type: 'object', name: 'p', title: 'Paragraph', fields: [{ name: 'text', type: 'text', rows: 4, validation: (r) => r.required() }], preview: { select: { title: 'text' } } }),
      defineArrayMember({ type: 'object', name: 'h2', title: 'Heading', fields: [{ name: 'text', type: 'string', validation: (r) => r.required() }], preview: { select: { title: 'text' }, prepare: ({ title }) => ({ title: `H2 · ${title}` }) } }),
      defineArrayMember({ type: 'object', name: 'h3', title: 'Sub-heading', fields: [{ name: 'text', type: 'string', validation: (r) => r.required() }], preview: { select: { title: 'text' }, prepare: ({ title }) => ({ title: `H3 · ${title}` }) } }),
      defineArrayMember({ type: 'object', name: 'ul', title: 'Bullet list', fields: [{ name: 'items', type: 'array', of: [{ type: 'string' }], validation: (r) => r.required().min(1) }], preview: { select: { items: 'items' }, prepare: ({ items }) => ({ title: `List · ${(items ?? []).length} items` }) } }),
      defineArrayMember({ type: 'object', name: 'todo', title: 'Content to come (shown to readers)', fields: [{ name: 'text', type: 'string', validation: (r) => r.required() }], preview: { select: { title: 'text' }, prepare: ({ title }) => ({ title: `TODO · ${title}` }) } }),
    ],
  });

export const slugField = defineField({
  name: 'slug',
  title: 'URL slug',
  type: 'slug',
  options: { source: 'title', maxLength: 96 },
  validation: (r) => r.required().custom((s) => (s?.current && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.current) ? true : 'Use lowercase letters, numbers and dashes')),
});

/** Fields every editorial document has. Slugs are unique per type (Sanity's default isUnique check). */
export const editorialFields = [
  defineField({ name: 'title', title: 'Title', type: 'string', validation: (r) => r.required().max(120) }),
  slugField,
  defineField({ name: 'summary', title: 'Summary', type: 'text', rows: 2, validation: (r) => r.required().max(300) }),
  defineField({
    name: 'verified',
    title: 'Facts verified',
    type: 'boolean',
    initialValue: false,
    description: 'Tick only after every factual statement has been checked against a reliable source. Unticked pages show “facts to verify”.',
  }),
  defineField({ name: 'seoDescription', title: 'SEO description', type: 'string', validation: (r) => r.max(160) }),
  defineField({ name: 'canonical', title: 'Canonical URL (optional)', type: 'url' }),
];
