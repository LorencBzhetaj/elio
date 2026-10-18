/**
 * Place card + "Save to my trip" button shared by the full map (/map) and the homepage map preview,
 * so both behave and look the same. Save state stays in sync through trip/client.ts.
 */
import { isSaved, toggleSaved } from '../trip/client';

export interface CardImage {
  src?: string;
  alt: string;
  scene: string;
}

export interface CardPlace {
  title: string;
  category: string;
  summary: string;
  url: string;
  image: CardImage;
  tripId: string | null;
  destination?: string;
  precision?: string;
  verified?: boolean;
}

export function thumb(img: CardImage): HTMLElement {
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

export function saveButton(item: { title: string; tripId: string | null }, announce: (msg: string) => void): HTMLButtonElement | null {
  if (!item.tripId) return null;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mbtn mbtn--save';
  b.dataset.save = item.tripId;
  paintSave(b, item.title);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = toggleSaved(item.tripId!);
    announce(r === null ? 'Could not save — browser storage is blocked.' : r ? `${item.title} saved to your trip.` : `${item.title} removed from your trip.`);
  });
  return b;
}

/** Refreshes one save button from storage (used after any trip change). */
export function paintSave(b: HTMLButtonElement, title = '') {
  const saved = isSaved(b.dataset.save!);
  b.setAttribute('aria-pressed', String(saved));
  b.textContent = saved ? 'Saved ✓' : 'Save to my trip';
  if (title) b.setAttribute('aria-label', saved ? `${title} is saved — remove from my trip` : `Save ${title} to my trip`);
}

/** Fills a card element. Pass extra actions (e.g. "Open full map") after the default ones. */
export function fillCard(
  card: HTMLElement,
  content: { title: string; meta: string; summary: string; image?: CardImage; note?: string; actions: HTMLElement[] },
  onClose: () => void,
) {
  card.replaceChildren();
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'mcard__close';
  close.setAttribute('aria-label', 'Close place details');
  close.textContent = '×';
  close.addEventListener('click', onClose);
  const body = document.createElement('div');
  body.className = 'mcard__body';
  const h = document.createElement('h2');
  h.className = 'mcard__title';
  h.textContent = content.title;
  const meta = document.createElement('p');
  meta.className = 'mcard__meta';
  meta.textContent = content.meta;
  const sum = document.createElement('p');
  sum.className = 'mcard__summary';
  sum.textContent = content.summary;
  body.append(h, meta, sum);
  if (content.note) {
    const note = document.createElement('p');
    note.className = 'mcard__note';
    note.textContent = content.note;
    body.append(note);
  }
  const actions = document.createElement('div');
  actions.className = 'mcard__actions';
  actions.append(...content.actions);
  body.append(actions);
  card.append(close, ...(content.image ? [thumb(content.image)] : []), body);
  card.hidden = false;
  card.setAttribute('aria-label', `${content.title} details`);
}

/** Standard card for a public place. */
export function fillPlaceCard(card: HTMLElement, item: CardPlace, opts: { onClose: () => void; announce: (msg: string) => void; extraActions?: HTMLElement[] }) {
  const details = document.createElement('a');
  details.className = 'btn btn--sm';
  details.href = item.url;
  details.textContent = 'View details';
  const save = saveButton(item, opts.announce);
  fillCard(
    card,
    {
      title: item.title,
      meta: [item.category, item.destination].filter(Boolean).join(' · '),
      summary: item.summary,
      image: item.image,
      note:
        item.verified === false
          ? item.precision === 'town-centre'
            ? 'Pin shows the approximate town centre and has not been verified yet.'
            : 'Location not verified yet.'
          : undefined,
      actions: [details, ...(save ? [save] : []), ...(opts.extraActions ?? [])],
    },
    opts.onClose,
  );
}
