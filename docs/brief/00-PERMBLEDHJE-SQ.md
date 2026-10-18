# Si do të ndërtohet dhe si funksionon
Faqja do të jetë një infopoint digjital për Shqipërinë: vizitori lexon falas për destinacionet, transportin, photo spots dhe eventet. Në faqet përkatëse sheh një guidë premium që i kursen planifikimin: PDF i shkarkueshëm, itinerar dhe hartë online.

Rrjedha: Google/Instagram → artikull ose destinacion → informacion falas → preview i guidës → pagesë → verifikim në server → email dhe akses te produkti. Llogaria nuk është kusht për blerjen. Nëse pagesa është ende në proces, faqja tregon se po verifikohet; nuk shfaq shkarkimin menjëherë pas redirect-it.

Zgjedhja e propozuar është Astro + TypeScript + Sanity CMS + PostgreSQL + storage privat + email transaksional. Astro shërben faqet publike shpejt; endpoint-et në server mbajnë porositë, pagesat dhe aksesin. CMS administron përmbajtjen; paneli i kufizuar i porosive administron shitjet. Pagesat janë Paysera ose POK, me të njëjtën logjikë porosie.

Dy hero për të njëjtën faqe: A kolazh editorial, “Postcards from Albania”, i bardhë dhe me thekse të buta; B sipas pamjeve të reja, panoramë shqiptare me krem/bordo dhe titull editorial. Klienti i sheh në /preview/hero-a dhe /preview/hero-b. Këto janë preview për zgjedhje dizajni; vizitori publik sheh vetëm variantin e përzgjedhur. Nëse klienti kërkon dy stile të plota faqesh, kjo është zgjerim më vete.

Trip planner në nisje: vizitori ruan destinacione dhe i rendit sipas ditëve në telefonin e vet. Nuk premtohen optimizim automatik i rrugës, sinkronizim në pajisje apo kohë udhëtimi në kohë reale. Hartat premium jepen pas blerjes; linket e jashtme mund të shpërndahen nga blerësit dhe nuk janë mbrojtje absolute.

Etapat: përzgjedhje vizuale → komponentët dhe faqet → CMS → porositë dhe mock pagesa → një ofrues real → dorëzim i sigurt → SEO dhe kontrolle mobile → publikim. Vlerësim orientues 4–6 javë për një zhvillues me përmbajtje gati; miratimi i merchant-it dhe prodhimi i përmbajtjes mund ta zgjasin. Nuk është ofertë fikse.
