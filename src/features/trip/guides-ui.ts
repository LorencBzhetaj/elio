/**
 * "Your guides" on My trip: guides owned by the buyer signed in on this browser.
 * Each buyer only sees their own (HttpOnly session from checkout or an email access link);
 * nothing private is in the page HTML. The first PDF opens automatically in the viewer.
 */
type Asset = { id: string; kind: 'pdf' | 'map_link'; label: string };
type Guide = { productId: string; slug: string; title: string; version: number; assets: Asset[] };

const el = (tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElement => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
};

const viewerSrc = (asset: Asset) => `/api/downloads/${encodeURIComponent(asset.id)}?inline=1`;
const downloadHref = (asset: Asset) => `/api/downloads/${encodeURIComponent(asset.id)}`;

function emptyState(body: HTMLElement, signedInAs?: string) {
  body.replaceChildren(
    el(
      'div',
      { className: 'card mt-empty' },
      el('h3', { className: 'mt-empty__title' }, 'Your guide will open here'),
      el('p', { className: 'muted' }, 'Buy a digital guide and it opens right on this page (we email you a link too). Or start with a free plan.'),
      el(
        'div',
        { className: 'mt-empty__actions' },
        el('a', { className: 'btn', href: '/guides' }, 'Get your guide'),
        el('a', { className: 'btn btn--outline', href: '/plan' }, 'Plan a free trip'),
      ),
      el(
        'p',
        { className: 'mt-small' },
        signedInAs ? `Signed in as ${signedInAs}. ` : '',
        'Bought a guide on another device? ',
        el('a', { href: '/access' }, 'Get an access link'),
      ),
    ),
  );
}

function renderGuides(body: HTMLElement, guides: Guide[], email: string) {
  const frame = el('iframe', { className: 'mt-viewer' }) as HTMLIFrameElement;
  const caption = el('p', { className: 'mt-viewer__caption' });
  const list = el('ul', { className: 'mt-list' });
  let first: { asset: Asset; title: string } | null = null;

  const show = (asset: Asset, title: string) => {
    frame.src = viewerSrc(asset);
    frame.title = `${title} (PDF)`;
    caption.textContent = `Showing: ${title}`;
    list.querySelectorAll<HTMLElement>('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === asset.id)));
  };

  for (const g of guides) {
    const pdf = g.assets.find((a) => a.kind === 'pdf');
    const maps = g.assets.filter((a) => a.kind === 'map_link');
    if (pdf && !first) first = { asset: pdf, title: g.title };
    const actions = el('div', { className: 'mt-guide__actions' });
    if (pdf) {
      const view = el('button', { type: 'button', className: 'mbtn' }, 'View here');
      view.dataset.view = pdf.id;
      view.addEventListener('click', () => {
        show(pdf, g.title);
        frame.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
      actions.append(
        view,
        el('a', { className: 'mbtn', href: viewerSrc(pdf), target: '_blank', rel: 'noopener' }, 'Open full screen'),
        el('a', { className: 'mbtn', href: downloadHref(pdf) }, 'Download PDF'),
      );
    }
    for (const m of maps) {
      actions.append(el('a', { className: 'mbtn', href: downloadHref(m), target: '_blank', rel: 'noopener' }, `${m.label} (online)`));
    }
    if (!g.assets.length) actions.append(el('p', { className: 'muted' }, 'The guide file is being prepared — we’ll email you when it’s ready.'));
    list.append(
      el('li', { className: 'card mt-guide' }, el('h3', { className: 'mt-guide__title' }, g.title), el('p', { className: 'mt-small' }, `Version ${g.version} · the PDF works offline after download`), actions),
    );
  }

  const signOut = el(
    'form',
    { method: 'post', action: '/api/access/logout', className: 'mt-signout' },
    el('span', { className: 'mt-small' }, `Signed in as ${email}. `),
    el('button', { type: 'submit', className: 'slink' }, 'Not you? Sign out on this device'),
  );
  body.replaceChildren(list, ...(first ? [caption, frame] : []), signOut);
  if (first) show(first.asset, first.title);
}

export async function initMyGuides(section: HTMLElement) {
  const body = section.querySelector<HTMLElement>('[data-guides-body]')!;
  if (new URLSearchParams(location.search).get('error') === 'download') {
    section.querySelector<HTMLElement>('[data-download-error]')!.hidden = false;
  }
  try {
    const res = await fetch('/api/me/guides', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return emptyState(body); // e.g. design preview without a shop database
    const data = (await res.json()) as { signedIn: boolean; email?: string; guides: Guide[] };
    if (data.signedIn && data.guides.length) renderGuides(body, data.guides, data.email ?? '');
    else emptyState(body, data.signedIn ? data.email : undefined);
  } catch {
    emptyState(body);
  }
}
