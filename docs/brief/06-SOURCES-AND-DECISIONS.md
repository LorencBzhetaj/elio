# Sources and unresolved decisions
Checked 16 October 2026. Official docs support the design choices; merchant eligibility, contractual fees and production readiness are not verified.

- Astro rendering/server routes: https://docs.astro.build/en/guides/on-demand-rendering/
- Astro build-time content fetch: https://docs.astro.build/en/guides/data-fetching/
- Paysera checkout overview (choose supported API family): https://developers.paysera.com/guides/checkout-v3
- Paysera classic callback reference (only if Classic is selected): https://developers.paysera.com/guides/checkout-classic/getting-started/making-your-first-payment/processing-callback
- Albania POK official site: https://pokpay.io/
- POK Payments API, Merchant Orders and retrieval: https://payments.doc.pokpay.io/
- Earlier visual inspiration from owner: https://www.saltinourhair.com/ ; do not copy its assets, branding or proprietary text.

Pending decision / safe interim:
Brand and domain / SiteSettings with provisional brand, no registration.
Hero / staging A and B, client chooses.
Paysera vs POK / mock first, one real adapter after approval.
Display/charge currency / sample pricing only until seller confirms currency; internal amountMinor and explicit provider conversion.
Photography / provided screenshots as references, licensed originals needed for publication.
Premium guide content and maps / product mock previews labeled; no fake fulfillment.
Seller legal/tax/refund/invoicing / owner/accountant-reviewed policies before accepting real payments.
Hosting/email / provider-neutral interfaces, select production accounts before deployment.

New screenshot filenames and roles are indexed in references/INDEX.md. The supplied images emphasize mobile; desktop layout must be designed responsively and compared with earlier desktop references, rather than claiming a supplied desktop screenshot exists for every new page.
