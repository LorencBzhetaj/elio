# Design contract and two hero alternatives
## Reference priority
New JPEGs supply the detailed current UI direction: warm cream, burgundy controls, serif headings, panoramic Albanian landscape, editorial annotations, rounded cards and mobile bottom navigation. Earlier mockups document the approved collage option and desktop structure. Use original design interpretation, not a screenshot embedded as the page.

Brand name is configurable. “Albania Decoded” is visible in new references; final naming must be confirmed. Hero A headline remains exactly “Postcards from Albania”. Hero B may use “Your Albania story starts here.” as in new reference, editable in CMS; client may use the same headline to compare only imagery.

## Hero A: approved earlier collage
White/light cream canvas. Centered overlapping travel photo collage, softly rounded corners, subtle postcard treatment. Large readable headline below or within reserved central whitespace; subtitle and Explore Albania / Shop Guides actions. Desktop composition retains generous margins; mobile uses 3–5 deliberate crops, never shrinks the whole desktop screenshot. Soft yellow/blue accents stay local to the hero; shared site structure remains consistent.

## Hero B: new panoramic direction
Immersive Albanian coast/mountains panorama blended into cream at the bottom. Logo/header above, legible dark editorial title over a quiet area, short subtitle, search field and burgundy primary CTA. Avoid making text part of the image. Configure separate mobile/desktop crops and focal points. Annotations are decorative, cannot carry essential information alone.

Both render through a common HeroProps contract: variant 'collage'|'panorama', heading, description, media[], focalPoints, primaryAction, secondaryAction. Site setting homepageHeroVariant controls production; two staging routes render each deterministically. No random assignment or automatic carousel. Client selection changes configuration, not a code fork. Reference screenshots are not web-ready source photo assets; obtain the originals/licences or use clearly labeled temporary assets.

## Starting tokens, to calibrate against references
Cream #FAF5EB; burgundy #7A1830; text #29221F; muted #70675D; sand #E9DDC7. Test actual color pairs before use. Serif candidate: Cormorant Garamond for headings, DM Sans for UI; verify licensed font delivery, use local WOFF2 and robust fallbacks. Do not lock exact fonts until comparing desktop/mobile to references.

Desktop max content width about 1200px, 24–40px gutters; mobile 16–20px gutters. Buttons min 44px touch area. Cards: 2 columns on mobile only when readable; long guide cards 1 column; desktop 3–4 columns. Sticky buy bar only on product pages, reserves space and respects mobile safe areas. Bottom navigation Home / Destinations / Guides / My Trip / More, only if useful across pages; ensure it never covers content or keyboard. Search is operational, not decorative.

## Required screens and states
Home; destination index/detail; journal index/detail; events; spots; guides index/detail; planner/saved trip; checkout; payment pending/error/cancelled; purchase access; empty/search/no results; 404; expired link; download failure. Test at 360, 390, 768, 1440px widths and 200% text zoom. Header must work without hover. Reduced motion; keyboard focus; semantic headings; readable contrast; accessible menu/modal focus management.

Prefer responsive AVIF/WebP pictures with dimensions; prioritize only actual LCP media, lazy-load below fold. Keep body text HTML, not raster. No invented statistics, reviews, prices or travel claims. Public content must remain useful without buying. Product page explains what is free, what is paid and whether maps require internet.
