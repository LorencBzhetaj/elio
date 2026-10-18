/**
 * /map page controller: filters + list + map, kept in sync both ways.
 * The list is fully usable without the map (keyboard, no WebGL, offline tiles, map load failure).
 */
import { initFilterBar, type FilterBarConfig } from '../filters/ui';
import type { FilterItem, FilterState } from '../filters/core';
import { isSaved, onTripChange, toggleSaved } from '../trip/client';
import type { MapRuntime } from './runtime';

interface Item extends FilterItem {
  kind: 'destination' | 'place' | 'event';
  title: string;
  category: string;
  summary: string;
  url: string;
  image: { src?: string; alt: string; scene: string };
  tripId: string | null;
  precision?: string;
  verified?: boolean;
  destination?: string;
}
interface Premium {
  id: string;
  title: string;
  note: string | null;
  guide: string;
  coords: [number, number];
}

export function initMapExplorer(root: HTMLElement) {
  const cfg = JSON.parse(root.querySelector('[data-map-config]')!.textContent || '{}') as FilterBarConfig & {
    styleUrl: string;
    font: string;
    bounds: [number, number, number, number];
  };
  const items = cfg.items as Item[];
  const byId = new Map(items.map((i) => [i.id, i]));
  const premiumById = new Map<string, Premium>();
  const list = root.querySelector<HTMLOListElement>('[data-map-list]')!;
  const unplaced = root.querySelector<HTMLElement>('[data-map-unplaced]')!;
  const unplacedList = root.querySelector<HTMLUListElement>('[data-map-unplaced-list]')!;
  const listEmpty = root.querySelector<HTMLElement>('[data-map-empty]')!;
  const canvas = root.querySelector<HTMLElement>('[data-map-canvas]')!;
  const mapStatus = root.querySelector<HTMLElement>('[data-map-status]')!;
  const areaBtn = root.querySelector<HTMLButtonElement>('[data-area]')!;
  const areaClear = root.querySelector<HTMLButtonElement>('[data-area-clear]')!;
  const card = root.querySelector<HTMLElement>('[data-map-card]')!;
  const viewBtns = root.querySelectorAll<HTMLButtonElement>('[data-view]');
  const announcer = root.querySelector<HTMLElement>('[data-map-announce]')!;
  const mobile = matchMedia('(max-width: 899.98px)');

  let runtime: MapRuntime | null = null;
  let mapState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  let visible: Item[] = [];
  let selected: string | null = new URLSearchParams(location.search).get('place');

  // ---------- list ----------
  function thumb(img: Item['image']) {
    if (img.src) {
      const el = document.createElement('img');
      el.src = img.src;
      el.alt = '';
      el.loading = 'lazy';
      el.className = 'sthumb';
      return el;
    }
    const el = document.createElement('span');
    el.className = `sthumb sthumb--${img.scene}`;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function saveButton(item: { id: string; title: string; tripId: string | null }) {
    if (!item.tripId) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mbtn mbtn--save';
    b.dataset.save = item.tripId;
    const saved = isSaved(item.tripId);
    b.setAttribute('aria-pressed', String(saved));
    b.textContent = saved ? 'Saved ✓' : 'Save to my trip';
    b.setAttribute('aria-label', saved ? `${item.title} is saved — remove from my trip` : `Save ${item.title} to my trip`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = toggleSaved(item.tripId!);
      announcer.textContent = r === null ? 'Could not save — browser storage is blocked.' : r ? `${item.title} saved to your trip.` : `${item.title} removed from your trip.`;
    });
    return b;
  }

  function listItem(item: Item): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'mitem';
    li.dataset.id = item.id;
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'mitem__main';
    main.setAttribute('aria-current', String(item.id === selected));
    const text = document.createElement('span');
    text.className = 'mitem__text';
    const t = document.createElement('span');
    t.className = 'mitem__title';
    t.textContent = item.title;
    const m = document.createElement('span');
    m.className = 'mitem__meta';
    m.textContent = [item.category, item.destination].filter(Boolean).join(' · ');
    text.append(t, m);
    if (item.coords && item.verified === false) {
      const chip = document.createElement('span');
      chip.className = 'mitem__chip';
      chip.textContent = item.precision === 'town-centre' ? 'Approx. town centre · to verify' : 'Location to verify';
      text.append(chip);
    }
    main.append(thumb(item.image), text);
    main.addEventListener('click', () => select(item.id, { fly: true, fromList: true }));
    const actions = document.createElement('div');
    actions.className = 'mitem__actions';
    const details = document.createElement('a');
    details.href = item.url;
    details.className = 'mbtn';
    details.textContent = 'Details';
    details.setAttribute('aria-label', `${item.title} — view details`);
    actions.append(details);
    const save = saveButton(item);
    if (save) actions.append(save);
    li.append(main, actions);
    return li;
  }

  function renderList(state: FilterState) {
    const placed = visible.filter((i) => i.coords);
    list.replaceChildren(...placed.map(listItem));
    // Places without a public location are listed, never given an invented pin.
    const noCoords = state.bbox ? [] : visible.filter((i) => !i.coords);
    unplacedList.replaceChildren(...noCoords.map(listItem));
    unplaced.hidden = noCoords.length === 0;
    listEmpty.hidden = visible.length > 0;
    areaClear.hidden = !state.bbox;
    const sel = root.querySelector('[data-map-premium-list]');
    if (sel) sel.replaceChildren(...[...premiumById.values()].map(premiumListItem));
  }

  function premiumListItem(p: Premium): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'mitem';
    li.dataset.id = p.id;
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'mitem__main';
    main.innerHTML = '';
    const text = document.createElement('span');
    text.className = 'mitem__text';
    const t = document.createElement('span');
    t.className = 'mitem__title';
    t.textContent = p.title;
    const m = document.createElement('span');
    m.className = 'mitem__meta';
    m.textContent = `From your ${p.guide}`;
    text.append(t, m);
    const dot = document.createElement('span');
    dot.className = 'sthumb sthumb--premium';
    dot.setAttribute('aria-hidden', 'true');
    main.append(dot, text);
    main.addEventListener('click', () => select(p.id, { fly: true, fromList: true }));
    li.append(main);
    return li;
  }

  // ---------- selection card ----------
  function renderCard() {
    const item = selected ? byId.get(selected) : undefined;
    const prem = selected ? premiumById.get(selected) : undefined;
    if (!item && !prem) {
      card.hidden = true;
      return;
    }
    card.replaceChildren();
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mcard__close';
    close.setAttribute('aria-label', 'Close place details');
    close.textContent = '×';
    close.addEventListener('click', () => select(null));
    const body = document.createElement('div');
    body.className = 'mcard__body';
    const h = document.createElement('h2');
    h.className = 'mcard__title';
    const meta = document.createElement('p');
    meta.className = 'mcard__meta';
    const sum = document.createElement('p');
    sum.className = 'mcard__summary';
    const actions = document.createElement('div');
    actions.className = 'mcard__actions';
    if (item) {
      h.textContent = item.title;
      meta.textContent = [item.category, item.destination].filter(Boolean).join(' · ');
      sum.textContent = item.summary;
      const a = document.createElement('a');
      a.className = 'btn btn--sm';
      a.href = item.url;
      a.textContent = 'View details';
      actions.append(a);
      const s = saveButton(item);
      if (s) actions.append(s);
      card.append(close, thumb(item.image), body);
      if (item.verified === false) {
        const note = document.createElement('p');
        note.className = 'mcard__note';
        note.textContent = item.precision === 'town-centre' ? 'Pin shows the approximate town centre and has not been verified yet.' : 'Location not verified yet.';
        body.append(h, meta, sum, note, actions);
      } else body.append(h, meta, sum, actions);
    } else if (prem) {
      h.textContent = prem.title;
      meta.textContent = `From your ${prem.guide}`;
      sum.textContent = prem.note ?? '';
      const a = document.createElement('a');
      a.className = 'btn btn--sm';
      a.href = '/my-guides';
      a.textContent = 'Open my guides';
      actions.append(a);
      card.append(close, body);
      body.append(h, meta, sum, actions);
    }
    card.hidden = false;
    card.setAttribute('aria-label', `${h.textContent} details`);
  }

  function select(id: string | null, o: { fly?: boolean; fromList?: boolean; fromMap?: boolean } = {}) {
    selected = id;
    const url = new URL(location.href);
    id ? url.searchParams.set('place', id) : url.searchParams.delete('place');
    history.replaceState(history.state, '', url);
    root.querySelectorAll<HTMLElement>('.mitem').forEach((li) => li.querySelector('.mitem__main')?.setAttribute('aria-current', String(li.dataset.id === id)));
    const item = id ? byId.get(id) ?? premiumById.get(id) : undefined;
    const coords = item?.coords ?? undefined;
    if (o.fromList && mobile.matches && coords) setView('map');
    if (coords && mapState === 'idle') loadMap();
    runtime?.select(coords ? id : null, { fly: o.fly, coords: coords ?? undefined });
    if (o.fromMap) {
      const li = root.querySelector<HTMLElement>(`.mitem[data-id="${CSS.escape(id ?? '')}"]`);
      li?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    renderCard();
    if (item) announcer.textContent = `${item.title} selected`;
  }

  // ---------- filters ----------
  const filters = initFilterBar(root.querySelector('[data-filterbar]')!, cfg, {
    onChange(state, vis) {
      visible = vis as Item[];
      renderList(state);
      runtime?.setPoints(visible.filter((i) => i.coords).map((i) => ({ id: i.id, kind: i.kind, title: i.title, coords: i.coords! })));
      if (selected && !byId.has(selected) && !premiumById.has(selected)) select(null);
      if (selected && byId.has(selected) && !visible.some((v) => v.id === selected)) select(null);
      areaBtn.hidden = true;
    },
  });

  // ---------- map ----------
  async function loadMap() {
    if (mapState !== 'idle') return;
    mapState = 'loading';
    mapStatus.hidden = false;
    mapStatus.textContent = 'Loading map…';
    try {
      const { createMapRuntime } = await import('./runtime');
      runtime = await createMapRuntime({
        container: canvas,
        styleUrl: cfg.styleUrl,
        font: cfg.font,
        bounds: cfg.bounds,
        onSelect: (id) => select(id, { fromMap: true }),
        onUserMove: () => (areaBtn.hidden = false),
        onClusterLeaves: (ids) => {
          announcer.textContent = `${ids.length} places here`;
          const first = ids[0];
          if (first) select(first, { fromMap: true });
        },
      });
      mapState = 'ready';
      mapStatus.hidden = true;
      runtime.setPoints(visible.filter((i) => i.coords).map((i) => ({ id: i.id, kind: i.kind, title: i.title, coords: i.coords! })));
      if (selected) select(selected, { fly: true });
      pushPremiumToMap();
    } catch (err) {
      console.warn('[map] unavailable', err);
      mapState = 'failed';
      mapStatus.hidden = false;
      mapStatus.textContent = 'The map couldn’t load. You can still browse every place in the list.';
      root.classList.add('map-failed');
    }
  }

  function pushPremiumToMap() {
    runtime?.setPremium([...premiumById.values()].map((p) => ({ id: p.id, kind: 'premium', title: p.title, coords: p.coords })));
  }

  async function loadPremium() {
    if (root.dataset.hasGuides !== 'true') return;
    try {
      const res = await fetch('/api/map/premium', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const { points } = (await res.json()) as { points: Premium[] };
      points.forEach((p) => premiumById.set(p.id, p));
      pushPremiumToMap();
      const section = root.querySelector<HTMLElement>('[data-map-premium]');
      if (section && points.length) section.hidden = false;
      renderList(filters.getState());
    } catch {
      /* the public map still works */
    }
  }

  areaBtn.addEventListener('click', () => {
    if (!runtime) return;
    filters.setBbox(runtime.getBounds());
    announcer.textContent = 'Showing results in this map area';
  });
  areaClear.addEventListener('click', () => {
    filters.setBbox(null);
    announcer.textContent = 'Showing all results';
  });

  // ---------- views (phones) ----------
  function setView(view: 'list' | 'map') {
    root.dataset.view = view;
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (view === 'map') {
      loadMap();
      requestAnimationFrame(() => runtime?.resize());
    }
  }
  viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view as 'list' | 'map')));
  setView(new URLSearchParams(location.search).get('view') === 'map' ? 'map' : 'list');

  // Desktop: load when the map scrolls into view. Phones: when the Map view is chosen.
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && !mobile.matches) {
        io.disconnect();
        loadMap();
      }
    },
    { rootMargin: '200px' },
  );
  io.observe(canvas);
  mobile.addEventListener('change', () => runtime?.resize());

  onTripChange(() => {
    root.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => {
      const saved = isSaved(b.dataset.save!);
      b.setAttribute('aria-pressed', String(saved));
      b.textContent = saved ? 'Saved ✓' : 'Save to my trip';
    });
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') select(null);
  });
  // The buyer's guide places load independently of the map, so the list works even if the map fails.
  loadPremium();
  if (selected) renderCard();
}
