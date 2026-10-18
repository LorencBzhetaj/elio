/**
 * Filter toolbar + panel controller.
 *  - Text search applies live (debounced), URL updated with replaceState.
 *  - The panel edits a DRAFT: "Show N" applies it (pushState), closing without applying restores the
 *    previous selection, "Clear all" clears the draft only.
 *  - Back/forward and refresh restore the same view from the URL.
 */
import { debounce } from '../search/latest';
import {
  activeFilterCount,
  applyFilters,
  readState,
  summarize,
  writeParams,
  type BBox,
  type FilterGroup,
  type FilterItem,
  type FilterState,
  type SortOption,
} from './core';

export interface FilterBarConfig {
  groups: FilterGroup[];
  sorts: SortOption[];
  defaultSort: string;
  items: FilterItem[];
  noun: [string, string];
  listId?: string;
}

export interface FilterBarHandle {
  getState(): FilterState;
  setBbox(bbox: BBox | null): void;
  refresh(): void;
}

export function initFilterBar(root: HTMLElement, cfg: FilterBarConfig, hooks: { onChange?: (state: FilterState, visible: FilterItem[]) => void } = {}): FilterBarHandle {
  const q = root.querySelector<HTMLInputElement>('[data-fq]');
  const openBtn = root.querySelector<HTMLButtonElement>('[data-fopen]');
  const count = root.querySelector<HTMLElement>('[data-fcount]');
  const result = root.querySelector<HTMLElement>('[data-fresult]');
  const sortSel = root.querySelector<HTMLSelectElement>('[data-fsort]');
  const summary = root.querySelector<HTMLElement>('[data-fsummary]');
  const summaryText = root.querySelector<HTMLElement>('[data-fsummary-text]');
  const panel = root.querySelector<HTMLDialogElement>('[data-fpanel]');
  const draftText = panel?.querySelector<HTMLElement>('[data-fdraft]');
  const applyBtn = panel?.querySelector<HTMLButtonElement>('[data-fapply]');
  const zero = panel?.querySelector<HTMLElement>('[data-fzero]');
  const list = cfg.listId ? document.getElementById(cfg.listId) : null;
  const empty = list ? document.querySelector<HTMLElement>(`[data-fempty="${cfg.listId}"]`) : null;
  const [one, many] = cfg.noun;
  const noun = (n: number) => `${n} ${n === 1 ? one : many}`;

  let state = readState(new URLSearchParams(location.search), cfg.groups, cfg.sorts, cfg.defaultSort);
  let applying = false;

  const checkboxes = () => [...(panel?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];
  const draftGroups = () => {
    const g: Record<string, string[]> = {};
    for (const cb of checkboxes()) if (cb.checked) (g[cb.name] ??= []).push(cb.value);
    return g;
  };
  function syncCheckboxes() {
    for (const cb of checkboxes()) cb.checked = (state.groups[cb.name] ?? []).includes(cb.value);
  }

  function updateDraft() {
    if (!panel) return;
    const draft: FilterState = { ...state, groups: draftGroups() };
    const n = applyFilters(cfg.items, draft).length;
    const label = summarize(draft, cfg.groups, 4);
    if (draftText) draftText.textContent = label ? `Selected: ${label.replace(' · Map area', '')}` : 'No filters selected';
    if (applyBtn) {
      applyBtn.textContent = n ? `Show ${noun(n)}` : `No ${many} match`;
      applyBtn.disabled = n === 0;
    }
    if (zero) zero.hidden = n !== 0;
  }

  function render(push: 'push' | 'replace' | 'none') {
    const visible = applyFilters(cfg.items, state);
    if (list) {
      const byId = new Map([...list.querySelectorAll<HTMLElement>(':scope > [data-id]')].map((el) => [el.dataset.id!, el]));
      const shown = new Set(visible.map((v) => v.id));
      for (const [id, el] of byId) el.hidden = !shown.has(id);
      for (const v of visible) {
        const el = byId.get(v.id);
        if (el) list.append(el); // reorder in sort order
      }
      if (empty) empty.hidden = visible.length > 0;
    }
    if (result) result.textContent = noun(visible.length);
    const n = activeFilterCount(state);
    if (count) count.textContent = n ? String(n) : '';
    openBtn?.setAttribute('aria-label', n ? `Filters, ${n} active` : 'Filters');
    const s = summarize(state, cfg.groups);
    if (summary && summaryText) {
      summary.hidden = !s;
      summaryText.textContent = s;
    }
    if (q && q.value !== state.q && document.activeElement !== q) q.value = state.q;
    if (sortSel && state.sort) sortSel.value = state.sort;
    if (push !== 'none') {
      const url = new URL(location.href);
      url.search = writeParams(state, cfg.groups, cfg.defaultSort, url.searchParams).toString();
      if (url.href !== location.href) history[push === 'push' ? 'pushState' : 'replaceState'](history.state, '', url);
    }
    hooks.onChange?.(state, visible);
  }

  // Text search: live, combined with filters.
  const onType = debounce(() => {
    state = { ...state, q: q!.value };
    render('replace');
  }, 200);
  q?.addEventListener('input', onType);

  sortSel?.addEventListener('change', () => {
    state = { ...state, sort: sortSel.value };
    render('push');
  });

  // Panel
  function positionPanel() {
    if (!panel || !openBtn) return;
    if (matchMedia('(min-width: 768px)').matches) {
      const r = openBtn.getBoundingClientRect();
      const width = Math.min(380, window.innerWidth - 32);
      panel.style.top = `${Math.round(r.bottom + 8)}px`;
      panel.style.left = `${Math.round(Math.min(Math.max(16, r.left), window.innerWidth - width - 16))}px`;
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${Math.max(280, window.innerHeight - r.bottom - 24)}px`;
    } else {
      panel.style.top = panel.style.left = panel.style.width = panel.style.maxHeight = '';
    }
  }
  openBtn?.addEventListener('click', () => {
    if (!panel) return;
    syncCheckboxes();
    updateDraft();
    positionPanel();
    applying = false;
    panel.showModal();
    openBtn.setAttribute('aria-expanded', 'true');
    panel.querySelector<HTMLElement>('[data-fclose]')?.focus();
  });
  panel?.addEventListener('change', updateDraft);
  panel?.querySelector('[data-fclear-all]')?.addEventListener('click', () => {
    for (const cb of checkboxes()) cb.checked = false;
    updateDraft();
  });
  panel?.querySelector('[data-fclose]')?.addEventListener('click', () => panel.close());
  panel?.addEventListener('click', (e) => {
    if (e.target === panel) panel.close(); // backdrop
  });
  panel?.addEventListener('close', () => {
    if (!applying) syncCheckboxes(); // discard the draft
    openBtn?.setAttribute('aria-expanded', 'false');
    openBtn?.focus();
  });

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const submitter = (e as SubmitEvent).submitter;
    if (submitter?.hasAttribute('data-fapply')) {
      state = { ...state, groups: draftGroups() };
      applying = true;
      panel?.close();
      render('push');
    } else {
      onType.cancel();
      state = { ...state, q: q?.value ?? '' };
      render('push');
    }
  });

  const clearFilters = () => {
    state = { ...state, groups: {}, bbox: null };
    syncCheckboxes();
    render('push');
  };
  root.querySelector('[data-fsummary-clear]')?.addEventListener('click', clearFilters);
  empty?.querySelector('[data-fempty-clear]')?.addEventListener('click', clearFilters);

  window.addEventListener('popstate', () => {
    state = readState(new URLSearchParams(location.search), cfg.groups, cfg.sorts, cfg.defaultSort);
    if (q) q.value = state.q;
    syncCheckboxes();
    render('none');
  });
  window.addEventListener('resize', () => panel?.open && positionPanel());

  render('none');
  return {
    getState: () => state,
    setBbox(bbox) {
      state = { ...state, bbox };
      render('push');
    },
    refresh: () => render('none'),
  };
}
