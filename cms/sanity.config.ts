import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';
import { structure } from './structure';

export default defineConfig({
  name: 'albania-travel',
  title: 'Albania travel — content',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'replace-me',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  plugins: [structureTool({ structure }), visionTool()],
  schema: { types: schemaTypes },
  document: {
    // Site settings is a singleton.
    newDocumentOptions: (prev) => prev.filter((t) => t.templateId !== 'siteSettings'),
    actions: (prev, ctx) => (ctx.schemaType === 'siteSettings' ? prev.filter((a) => !['duplicate', 'delete', 'unpublish'].includes(a.action ?? '')) : prev),
  },
});
