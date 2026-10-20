# Udhëzues për pronarin

## Çfarë është ndërtuar

- Faqe në anglisht për turistët: destinacione, informacion praktik (essentials), photo spots, evente,
  ditar (journal), kërkim, planifikues udhëtimi dhe dyqan guidash.
- **Dy variante hero** mbi të njëjtën homepage:
  - **A — Kolazh editorial** “Postcards from Albania” (`/preview/hero-a`)
  - **B — Panoramë** krem/bordo “Your Albania story starts here.” (`/preview/hero-b`)
  - Krahasim krah për krah në telefon/tablet/desktop: `/preview`
- Blerje pa llogari: faqja e guidës → checkout me email → pagesë (tani **e simuluar**) → serveri
  verifikon pagesën → guida hapet te “My trip” dhe dërgohet email me link njëpërdorimësh.
- PDF-të ruhen privatisht dhe shkarkohen vetëm pas kontrollit të blerjes, me link që skadon pas 60 sekondash.
- Paneli i porosive për pronarin: `/admin/orders` (kërkim, sinkronizim me ofruesin, ridërgim emaili, revokim aksesi, histori veprimesh).
- CMS (Sanity) në dosjen `cms/` për të redaktuar përmbajtjen.

## Kërkimi, filtrat dhe harta (përditësim)

- **Kërkim me sugjerime** në hero dhe header (në telefon hapet në ekran të plotë). Gjen pa marrë parasysh ë/e, ç/c dhe variantet e emrave (Thethi/Theth, Shkodra/Shkodër).
- **Filtra të thjeshtë**: një fushë kërkimi, butoni “Filters” (panel/bottom sheet), numri i rezultateve dhe “Sort” vetëm kur duhet. Gjendja ruhet në URL.
- **Hartë interaktive** te `/map` dhe preview në homepage. Përdor MapLibre + OpenFreeMap (falas, pa çelës, por pa garanci shërbimi). Për publikim rekomandoj MapTiler/Stadia ose self-hosting — shih `docs/map.md`.
- Destinacionet kanë vetëm koordinata të përafërta të qendrës së qytetit, të shënuara “to verify”. Photo spots nuk kanë ende koordinata dhe shfaqen te “Not on the map yet”.
- Vendet premium të guidave shfaqen në hartë vetëm për blerësit (tani janë 2 pika TEST).
- Pamjet: `docs/screenshots/`.

## My trip, homepage dhe logo (përditësim 21 tetor 2026)

- **My trip** (`/my-trip`): nëse s'ka blerë guidë, shfaqen vetëm dy butona — “Get your guide” (`/guides`) dhe “Plan a free trip” (`/plan`, versioni falas). Pas blerjes, PDF-ja hapet automatikisht në faqe, me “Open full screen” dhe “Download PDF”. `/my-guides` tani ridrejton këtu.
- **Secili përdorues sheh vetëm guidat e veta**: identiteti është emaili i blerjes. Pas pagesës shfletuesi merr një cookie sesioni HttpOnly; në pajisje tjetër blerësi kërkon link aksesi me email te `/access`. Asgjë private nuk është në HTML-në publike. Plani falas ruhet vetëm në pajisje.
- Në iPhone, PDF brenda faqes shfaq vetëm faqen e parë — prandaj ka butonin “Open full screen”.
- **Logo “Albania Decoded”** lart majtas (lidhet me homepage, `alt="Albania Decoded"`) dhe **vula me shqiponjë** si dekor (`alt=""`, `aria-hidden`). Skedarët: `public/brand/`.
- **Homepage**: 4 ikonat në një rresht edhe në telefon, 3 karta destinacionesh në rresht, degë ulliri dekorative majtas, seksione sipas referencës. Vlerësimet, numrat (“100+”) dhe recensionet e referencës nuk u shtuan, sepse nuk kemi të dhëna reale.
- Rregulluar: “Cancel” te kërkimi në telefon dhe paneli i filtrave në iPhone.

## Si ta nisni në kompjuter

```bash
npm install
cp .env.example .env      # vendosni APP_SECRET (të paktën 32 karaktere të rastësishme)
npm run db:seed
npm run dev               # hapni http://localhost:4321/preview
```

## Si zgjidhet hero

Pasi të vendosni A ose B, ndryshohet vetëm një konfigurim (jo kodi):
- në CMS: *Site settings → Homepage hero*, ose
- në server: `HOMEPAGE_HERO_VARIANT=collage` (A) ose `panorama` (B).

Vizitorët publikë shohin vetëm variantin e zgjedhur. Faqet `/preview` janë private (në staging kërkojnë `PREVIEW_ACCESS_KEY`).

## Pagesat

Për momentin është aktiv vetëm **mock** (asnjë para reale, asnjë kartë). Paysera dhe POK janë të
përgatitura si ndërfaqe, por qëllimisht **nuk funksionojnë** derisa:
1. të zgjidhni ofruesin dhe të keni miratimin e merchant-it,
2. të merren dokumentet zyrtare aktuale (API, nënshkrimi i callback-ut, njësitë e shumës, monedha),
3. të plotësohet `docs/payments-integration-note.md` dhe të testohet në sandbox.

Suksesi i pagesës vendoset vetëm nga serveri pas verifikimit me ofruesin; kthimi nga faqja e pagesës nuk mjafton.

## Çfarë mungon (duhet nga ju)

- Zgjedhja e hero-s, emri përfundimtar dhe domain-i.
- Ofruesi i pagesave (Paysera/POK), monedha dhe çmimet përfundimtare (tani janë çmime testi $5/$9/$15).
- **Fotografi të licencuara** — tani janë ilustrime me shënimin “Illustration · photo pending”; çdo vend tregon çfarë fotoje duhet.
- Përmbajtje e verifikuar për destinacionet, artikujt dhe informacionin praktik (tani janë mostra të shënuara “facts to verify”). Nuk u shpikën fakte, çmime, recensione apo statistika.
- Evente reale me burim dhe datë kontrolli (tani nuk ka asnjë).
- PDF-të dhe hartat e vërteta të guidave (tani ka PDF “TEST PLACEHOLDER”).
- Politikat e privatësisë, kushtet e shitjes dhe rimbursimit, të rishikuara ligjërisht.
- Email-i i suportit, hostingu dhe ofruesi i email-eve transaksionale.

## Dokumente të tjera

- `README.md` — udhëzime teknike (anglisht)
- `docs/admin-guide.md` — si redaktohet përmbajtja, produktet dhe porositë
- `docs/runbook.md` — operimi, alarmet, backup/restore, lista para publikimit
- `docs/decisions-and-gaps.md` — vendimet e hapura
- `docs/test-results.md` — rezultatet e kontrolleve
