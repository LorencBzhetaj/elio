/**
 * Search-as-you-type combobox (WAI-ARIA combobox + listbox, aria-activedescendant pattern).
 * One implementation drives every instance: hero field, header/mobile dialog and the /search page.
 */
import { createLatestOnly, debounce } from './latest';
import { highlightRanges } from './normalize';

interface ApiResult {
  id: string;
  type: string;
  category: string;
  title: string;
  url: string;
  summary: string;
  image: { src?: string; alt: string; scene: string };
  destination?: { slug: string; title: string };
}
interface ApiResponse {
  query: string;
  total: number;
  results: ApiResult[];
  regions: string[];
  suggestions?: { destinations: ApiResult[]; searches: string[] };
}
type Option = { kind: 'link'; href: string; result: ApiResult } | { kind: 'query'; query: string };

const INITIAL = 8;
const MIN = 2;
const DEBOUNCE_MS = 200;
let suggestionCache: Promise<ApiResponse> | null = null;

export interface SearchBoxHandle {
  setQuery(q: string, run?: boolean): void;
  focus(): void;
  open(): void;
  close(): void;
}

export function initSearchBox(root: HTMLElement, opts: { variant: 'inline' | 'dialog' | 'page'; onEscape?: () => void; syncUrl?: boolean; suppress?: () => boolean }): SearchBoxHandle {
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const form = $<HTMLFormElement>('form');
  const input = $<HTMLInputElement>('[data-input]');
  const clearBtn = $<HTMLButtonElement>('[data-clear]');
  const panel = $<HTMLElement>('[data-panel]');
  const list = $<HTMLUListElement>('[data-list]');
  const status = $<HTMLElement>('[data-status]');
  const more = $<HTMLButtonElement>('[data-more]');
  const typeSel = $<HTMLSelectElement>('[data-type]');
  const regionSel = root.querySelector<HTMLSelectElement>('[data-region]');
  const filtersBtn = root.querySelector<HTMLButtonElement>('[data-filters-toggle]');
  const filtersBox = root.querySelector<HTMLElement>('[data-filters]');
  const clearFilters = $<HTMLButtonElement>('[data-clear-filters]');
  const filterCount = root.querySelector<HTMLElement>('[data-filter-count]');
  const idBase = input.id;

  const latest = createLatestOnly();
  let options: Option[] = [];
  let active = -1;
  let expanded = false;
  let last: ApiResponse | null = null;
  let loadingTimer: ReturnType<typeof setTimeout> | undefined;
  const alwaysOpen = opts.variant !== 'inline';

  const isOpen = () => !panel.hidden;
  function open() {
    panel.hidden = false;
    if (!alwaysOpen) {
      // Fit the dropdown into the space below the field; it scrolls inside instead of moving the page.
      const below = window.innerHeight - form.getBoundingClientRect().bottom - 16;
      panel.style.maxHeight = `${Math.max(240, Math.min(560, below))}px`;
    }
    input.setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (alwaysOpen) return;
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function activeFilters() {
    return (typeSel.value ? 1 : 0) + (regionSel?.value ? 1 : 0);
  }
  function updateFilterUi() {
    const n = activeFilters();
    clearFilters.hidden = n === 0;
    if (filterCount) filterCount.textContent = n ? String(n) : '';
    filtersBtn?.setAttribute('aria-label', n ? `Filters, ${n} active` : 'Filters');
  }

  function setActive(i: number) {
    const items = list.querySelectorAll<HTMLElement>('[role="option"]');
    items.forEach((el, idx) => el.setAttribute('aria-selected', String(idx === i)));
    active = i;
    if (i >= 0 && items[i]) {
      input.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function activate(i: number) {
    const opt = options[i];
    if (!opt) return;
    if (opt.kind === 'link') window.location.assign(opt.href);
    else setQuery(opt.query, true);
  }

  function thumb(r: ApiResult): HTMLElement {
    if (r.image.src) {
      const img = document.createElement('img');
      img.src = r.image.src;
      img.alt = '';
      img.loading = 'lazy';
      img.className = 'sthumb';
      return img;
    }
    const d = document.createElement('span');
    d.className = `sthumb sthumb--${r.image.scene}`;
    d.setAttribute('aria-hidden', 'true');
    return d;
  }

  function markText(text: string, query: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const [s, e] of highlightRanges(text, query)) {
      if (s > pos) frag.append(text.slice(pos, s));
      const m = document.createElement('mark');
      m.textContent = text.slice(s, e);
      frag.append(m);
      pos = e;
    }
    frag.append(text.slice(pos));
    return frag;
  }

  function optionEl(i: number, opt: Option, query: string): HTMLLIElement {
    const li = document.createElement('li');
    li.id = `${idBase}-opt-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.className = 'sopt';
    if (opt.kind === 'link') {
      const r = opt.result;
      const text = document.createElement('span');
      text.className = 'sopt__text';
      const title = document.createElement('span');
      title.className = 'sopt__title';
      title.append(markText(r.title, query));
      const meta = document.createElement('span');
      meta.className = 'sopt__meta';
      meta.textContent = r.destination && r.type !== 'destination' ? `${r.category} · ${r.destination.title}` : r.category;
      text.append(title, meta);
      li.append(thumb(r), text);
    } else {
      li.classList.add('sopt--query');
      const icon = document.createElement('span');
      icon.className = 'sthumb sthumb--query';
      icon.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'sopt__title';
      text.textContent = opt.query;
      li.append(icon, text);
    }
    li.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
    li.addEventListener('click', () => activate(i));
    return li;
  }

  function groupLabel(text: string) {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    li.className = 'sgroup';
    li.textContent = text;
    return li;
  }

  function addOption(opt: Option, query: string) {
    options.push(opt);
    list.append(optionEl(options.length - 1, opt, query));
  }

  function render(data: ApiResponse) {
    last = data;
    list.replaceChildren();
    options = [];
    setActive(-1);
    const q = input.value.trim();
    more.hidden = true;

    if (!q) {
      const s = data.suggestions;
      if (s?.destinations.length) {
        list.append(groupLabel('Suggested destinations'));
        for (const r of s.destinations) addOption({ kind: 'link', href: r.url, result: r }, '');
      }
      if (s?.searches.length) {
        list.append(groupLabel('Suggested searches'));
        for (const query of s.searches) addOption({ kind: 'query', query }, '');
      }
      status.textContent = '';
      return;
    }
    if (q.replace(/\s/g, '').length < MIN) {
      status.textContent = `Type at least ${MIN} letters.`;
      return;
    }
    const shown = expanded ? data.results : data.results.slice(0, INITIAL);
    for (const r of shown) addOption({ kind: 'link', href: r.url, result: r }, q);
    if (data.total === 0) {
      status.textContent = activeFilters() ? `No results for “${q}” with these filters.` : `No results for “${q}”. Try a place name or fewer words.`;
    } else {
      status.textContent = `${data.total} ${data.total === 1 ? 'result' : 'results'}${shown.length < data.total ? `, showing ${shown.length}` : ''}`;
    }
    const remaining = Math.min(data.results.length, 50) - shown.length;
    if (remaining > 0) {
      more.hidden = false;
      more.textContent = `Show ${remaining} more`;
    }
  }

  async function runSearch() {
    const q = input.value.trim();
    clearBtn.hidden = !input.value;
    updateFilterUi();
    if (opts.syncUrl) {
      const u = new URL(location.href);
      q ? u.searchParams.set('q', q) : u.searchParams.delete('q');
      typeSel.value ? u.searchParams.set('type', typeSel.value) : u.searchParams.delete('type');
      regionSel?.value ? u.searchParams.set('region', regionSel.value) : u.searchParams.delete('region');
      history.replaceState(history.state, '', u);
    }
    if (q && q.replace(/\s/g, '').length < MIN) {
      latest.cancel();
      render({ query: q, total: 0, results: [], regions: [] });
      return;
    }
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      status.textContent = 'Searching…';
      root.setAttribute('aria-busy', 'true');
    }, 150);
    try {
      const outcome = await latest.run(async (signal) => {
        if (!q && suggestionCache) return suggestionCache;
        const params = new URLSearchParams({ q, limit: '50' });
        if (typeSel.value) params.set('type', typeSel.value);
        if (regionSel?.value) params.set('region', regionSel.value);
        const p = fetch(`/api/search?${params}`, { signal, headers: { accept: 'application/json' } }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<ApiResponse>;
        });
        if (!q) suggestionCache = p.catch((e) => ((suggestionCache = null), Promise.reject(e)));
        return p;
      });
      if (outcome.stale) return; // an older response arrived after a newer query — ignore it
      expanded = false;
      render(outcome.value);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      list.replaceChildren();
      options = [];
      status.replaceChildren('Search is unavailable right now. ');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'slink';
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => runSearch());
      status.append(retry);
    } finally {
      clearTimeout(loadingTimer);
      root.removeAttribute('aria-busy');
    }
  }
  const debounced = debounce(runSearch, DEBOUNCE_MS);

  function setQuery(q: string, run = true) {
    input.value = q;
    clearBtn.hidden = !q;
    if (run) {
      debounced.cancel();
      open();
      runSearch();
    }
  }

  input.addEventListener('input', () => {
    if (opts.suppress?.()) return;
    open();
    clearBtn.hidden = !input.value;
    debounced();
  });
  input.addEventListener('focus', () => {
    if (opts.suppress?.()) return;
    if (!isOpen()) {
      open();
      if (!last) runSearch();
    }
  });
  input.addEventListener('keydown', (e) => {
    const n = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen()) open();
        if (n) setActive(active < n - 1 ? active + 1 : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (n) setActive(active > 0 ? active - 1 : n - 1);
        break;
      case 'Home':
      case 'End':
        if (n && isOpen() && e.ctrlKey) {
          e.preventDefault();
          setActive(e.key === 'Home' ? 0 : n - 1);
        }
        break;
      case 'Enter':
        e.preventDefault(); // results appear in the panel; no page navigation
        if (active >= 0) activate(active);
        else {
          debounced.cancel();
          open();
          runSearch();
        }
        break;
      case 'Escape':
        if (active >= 0) {
          e.preventDefault();
          setActive(-1);
        } else if (opts.onEscape) {
          e.preventDefault();
          opts.onEscape();
        } else if (isOpen() && !alwaysOpen) {
          e.preventDefault();
          close();
        } else if (input.value) {
          e.preventDefault();
          setQuery('', true);
        }
        break;
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (active >= 0) activate(active);
    else {
      debounced.cancel();
      open();
      runSearch();
    }
  });
  clearBtn.addEventListener('click', () => {
    setQuery('', true);
    input.focus();
  });
  more.addEventListener('click', () => {
    expanded = true;
    if (last) render(last);
    input.focus();
  });
  typeSel.addEventListener('change', () => runSearch());
  regionSel?.addEventListener('change', () => runSearch());
  filtersBtn?.addEventListener('click', () => {
    const show = filtersBox!.hidden;
    filtersBox!.hidden = !show;
    filtersBtn.setAttribute('aria-expanded', String(show));
  });
  clearFilters.addEventListener('click', () => {
    typeSel.value = '';
    if (regionSel) regionSel.value = '';
    runSearch();
    input.focus();
  });
  // Close the inline dropdown when focus leaves the whole component or on outside click.
  if (!alwaysOpen) {
    root.addEventListener('focusout', (e) => {
      const next = e.relatedTarget as Node | null;
      if (next && root.contains(next)) return;
      setTimeout(() => {
        if (!root.contains(document.activeElement)) close();
      }, 0);
    });
    document.addEventListener('pointerdown', (e) => {
      if (isOpen() && !root.contains(e.target as Node)) close();
    });
  }

  updateFilterUi();
  if (alwaysOpen) {
    open();
    if (opts.variant === 'page') runSearch();
  }

  return {
    setQuery,
    focus: () => input.focus(),
    open,
    close,
  };
}
