import type { StructureResolver } from 'sanity/structure';

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem().title('Site settings').id('siteSettings').child(S.document().schemaType('siteSettings').documentId('siteSettings')),
      S.divider(),
      S.documentTypeListItem('destination').title('Destinations'),
      S.documentTypeListItem('essential').title('Essentials'),
      S.documentTypeListItem('place').title('Photo spots & places'),
      S.documentTypeListItem('event').title('Events'),
      S.documentTypeListItem('article').title('Journal'),
      S.documentTypeListItem('guideMarketing').title('Guide pages (marketing)'),
      S.documentTypeListItem('page').title('Pages & policies'),
    ]);
