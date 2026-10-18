# Product scope and route contract
## Public routes
| Route | Purpose and key sections |
|---|---|
| / | Header; hero; search; popular destinations; free/premium explanation; featured guides; photo spots; journal; events; footer |
| /destinations | Filter by region/type; cards and query-string filters; empty state |
| /destinations/[slug] | Cover, intro, highlights, when to go, how to arrive, things to do, curated places, related guide and articles |
| /essentials and /essentials/[slug] | Transport, money, connectivity and practical information |
| /photo-spots and /photo-spots/[slug] | Photos, access, light, permissions/safety notes, coordinates for free spots; premium spots excluded from public payloads |
| /events | Upcoming events by date/destination; organizer URL; last checked date; expired entries removed from upcoming results |
| /journal and /journal/[slug] | Travel stories and itineraries, author, updated date, related destinations and product |
| /guides and /guides/[slug] | Store, price/currency, contents, sample pages, format, language, online/offline limitations, update policy, FAQ, purchase CTA |
| /plan and /my-trip | Questionnaire and editable saved itinerary, MVP local storage |
| /search?q= | Public content only, filterable results and no-results suggestions |
| /about /contact /faq | Identity, support, explanation of products |
| /privacy /terms /refund-policy | Reviewed seller policies before live selling |

## Transaction/private routes
/checkout/[productSlug]: email, order summary, server-derived price, terms acknowledgement; marketing opt-in separate and optional.
/order/[opaqueReference]: return page; pending/success/failed/cancelled states; receipt access requires session authorization, never guessable IDs alone.
/access: request purchase access by email; generic response prevents revealing purchasers.
/access/redeem: short-lived single-use token exchange; establish HttpOnly session then redirect to clean /my-guides URL.
/my-guides: purchased PDFs, online map links, version and support.
/api/downloads/[assetId]: enforce purchase entitlement; issue brief signed download URL.
/admin/orders: authenticated owner/support only, search/status/resend/refund reconciliation; CMS for editorial content.
/preview/hero-a and /preview/hero-b: protected staging preview, noindex, same lower page content and viewport controls.

## Scope boundaries
No hotel/tour booking, supplier payouts, marketplace, subscriptions, AI itinerary generation, live transit, social profiles or full offline map engine in MVP. Map-first visual planning screenshots are inspiration: MVP saved list + optional free map visualization, not a promise of routing intelligence. Guide prices $5–$15 are indicative; no actual USD charging until merchant support and currency are confirmed.

## Journey and editorial operations
Publish verified destination/article → cross-link relevant product → preview → pay once → server verifies paid/captured amount → entitlement + email job → access. Editors can draft, preview, publish, correct and archive. Event records use Europe/Tirane dates, source links and lastCheckedAt. Past events stay accessible if useful but leave upcoming lists. Travel assertions and sample reviews must not be invented. Three verified destinations and three real guides are a sensible launch scope.
