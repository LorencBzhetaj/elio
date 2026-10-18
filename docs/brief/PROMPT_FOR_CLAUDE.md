# Paste this into Claude Code
You are implementing an English Albania travel information and digital guide website. Read README and documents 01–06 before writing code, inspect the target repository and local instructions, and inspect the supplied images visually.

Use Astro + TypeScript for content-first public pages with server commerce routes, Sanity CMS, PostgreSQL, private guide storage and transactional email. Adapt to the existing repository if one exists; explain any necessary architecture deviation. The nine new references show cream/burgundy “Albania Decoded” editorial UI. The previous approved reference is the white collage with “Postcards from Albania”. Brand/domain remain undecided.

Build TWO deterministic hero previews (A collage, B panorama) sharing the same homepage components below the hero. The client selects the hero; public visitors do not get a theme picker. Both need desktop and mobile crops. Do not bake text into images or use a complete screenshot as a hero image. Do not introduce a route optimizer just because the mockups contain maps.

Follow 05 task-by-task, beginning with public UI/CMS and mock commerce. Keep real payments disabled until one approved merchant integration is documented and tested. PAYsera or Albania POK will be chosen later; use the neutral contract in 04, implement only selected live provider. Never invent API endpoints/signatures, trust browser redirect for payment success, expose premium files in /public, use unrelated pok.tech APIs, or mix Paysera API families.

Reference screenshots are not licensed production photo assets. Use supplied originals if provided; otherwise mark photo slots clearly and report missing source assets. All locations, events, testimonials and travel details need verification before launch. No made-up ratings or published mock events.

Implement each stage with its verification; show the owner both hero previews first. Do not block independent UI work on absent gateway credentials. At handoff provide commands, environment variable template without secrets, migrations, CMS editor guide, operational runbook, test results and remaining decisions. Do not deploy automatically.
