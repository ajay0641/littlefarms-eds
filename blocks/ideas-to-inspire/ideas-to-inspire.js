/**
 * Ideas to Inspire block.
 * A heading followed by a horizontally scrollable row of tall image cards,
 * each with a title label overlaid at the bottom and linking to a category.
 *
 * Content model (positional rows):
 *   Row 1  → cell 1 = section heading (h2)
 *   Row 2+ → each row is one card: cell 1 = image (wrapped in a link),
 *            cell 2 = title text (falls back to the link/alt text)
 *
 * @param {Element} block The ideas-to-inspire block element
 */

/**
 * Scrolls the track by roughly one viewport width in the given direction.
 * @param {Element} track The scrolling track element
 * @param {number} dir -1 for previous, 1 for next
 */
function scrollTrack(track, dir) {
  track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
}

/**
 * Toggles the disabled state of the arrows and updates the progress bar
 * based on scroll position.
 * @param {Element} block The block element
 */
function updateArrows(block) {
  const track = block.querySelector('.ideas-to-inspire-track');
  const prev = block.querySelector('.ideas-to-inspire-arrow-prev');
  const next = block.querySelector('.ideas-to-inspire-arrow-next');
  const fill = block.querySelector('.ideas-to-inspire-progress-fill');
  if (!track) return;
  const maxScroll = track.scrollWidth - track.clientWidth;
  if (prev) prev.disabled = track.scrollLeft <= 0;
  if (next) next.disabled = track.scrollLeft >= maxScroll - 1;

  // Progress bar: fill width tracks how much of the row is in view; the fill
  // slides to reflect the current scroll offset.
  if (fill) {
    const ratio = track.clientWidth / track.scrollWidth;
    const widthPct = Math.min(100, Math.max(12, ratio * 100));
    fill.style.width = `${widthPct}%`;
    const progress = maxScroll > 0 ? track.scrollLeft / maxScroll : 0;
    const travel = 100 - widthPct;
    fill.style.transform = `translateX(${progress * travel}%)`;
  }
}

/**
 * Adds pointer drag-to-scroll to the track.
 * @param {Element} block The block element
 */
function initDrag(block) {
  const track = block.querySelector('.ideas-to-inspire-track');
  if (!track) return;
  let startX = 0;
  let startScroll = 0;
  let pending = false;
  let dragging = false;
  const DRAG_START = 6;

  track.addEventListener('pointerdown', (e) => {
    pending = true;
    dragging = false;
    startX = e.clientX;
    startScroll = track.scrollLeft;
  });
  track.addEventListener('pointermove', (e) => {
    if (!pending) return;
    const delta = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(delta) < DRAG_START) return;
      dragging = true;
      track.classList.add('is-dragging');
      track.setPointerCapture?.(e.pointerId);
    }
    track.scrollLeft = startScroll - delta;
  });
  const end = () => {
    if (!pending) return;
    pending = false;
    if (dragging) {
      dragging = false;
      track.classList.remove('is-dragging');
    }
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('pointerleave', end);

  // Prevent card links from navigating after a real drag.
  track.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (Math.abs(track.scrollLeft - startScroll) > DRAG_START) e.preventDefault();
    });
  });
  track.addEventListener('dragstart', (e) => e.preventDefault());
}

/**
 * loads and decorates the ideas-to-inspire block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  block.textContent = '';

  // --- Heading ---
  const headingRow = rows[0];
  const heading = document.createElement('div');
  heading.className = 'ideas-to-inspire-heading';
  while (headingRow.firstChild) heading.append(headingRow.firstChild);
  block.append(heading);

  // --- Track of cards ---
  const viewport = document.createElement('div');
  viewport.className = 'ideas-to-inspire-viewport';

  const track = document.createElement('div');
  track.className = 'ideas-to-inspire-track';

  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    const link = cells[0]?.querySelector('a');
    const media = cells[0]?.querySelector('picture, img');
    if (!media) return;

    const card = document.createElement('a');
    card.className = 'ideas-to-inspire-card';
    const href = link?.getAttribute('href');
    if (href) card.setAttribute('href', href);

    const imageWrap = document.createElement('span');
    imageWrap.className = 'ideas-to-inspire-image';
    imageWrap.append(media);
    card.append(imageWrap);

    const titleText = (cells[1]?.textContent || link?.textContent || media.querySelector('img')?.alt || '').trim();
    if (titleText) {
      const title = document.createElement('span');
      title.className = 'ideas-to-inspire-title';
      title.textContent = titleText;
      card.append(title);
    }

    track.append(card);
  });

  viewport.append(track);

  // --- Arrows ---
  const prev = document.createElement('button');
  prev.className = 'ideas-to-inspire-arrow ideas-to-inspire-arrow-prev';
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous ideas');

  const next = document.createElement('button');
  next.className = 'ideas-to-inspire-arrow ideas-to-inspire-arrow-next';
  next.type = 'button';
  next.setAttribute('aria-label', 'Next ideas');

  prev.addEventListener('click', () => scrollTrack(track, -1));
  next.addEventListener('click', () => scrollTrack(track, 1));
  track.addEventListener('scroll', () => updateArrows(block));
  window.addEventListener('resize', () => updateArrows(block));

  // --- Progress bar ---
  const progress = document.createElement('div');
  progress.className = 'ideas-to-inspire-progress';
  const fill = document.createElement('div');
  fill.className = 'ideas-to-inspire-progress-fill';
  progress.append(fill);

  block.append(viewport, prev, next, progress);

  initDrag(block);

  requestAnimationFrame(() => updateArrows(block));
  track.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', () => updateArrows(block), { once: true });
  });
}
