/**
 * Ideas to Inspire block.
 * A heading followed by a slick-style transform carousel of image cards, each
 * with a centered title over the image and a link to a category.
 *
 * Content model (positional rows):
 *   Row 1  → cell 1 = section heading (h2)
 *   Row 2+ → each row is one card: cell 1 = image (wrapped in a link),
 *            cell 2 = title text (falls back to the link/alt text)
 *
 * @param {Element} block The ideas-to-inspire block element
 */

/**
 * Reads the number of cards visible per view from the CSS variable.
 * @param {Element} track The slides track
 * @returns {number} visible cards (may be fractional, e.g. 4.5)
 */
function getVisible(track) {
  const raw = getComputedStyle(track).getPropertyValue('--ideas-visible').trim();
  return parseFloat(raw) || 1;
}

/**
 * @param {Element} track The slides track
 * @returns {number} the per-card step (card width + gap) in px
 */
function getStep(track) {
  const card = track.querySelector('.ideas-to-inspire-card');
  if (!card) return 0;
  const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
  return card.getBoundingClientRect().width + gap;
}

/**
 * @param {Element} carousel The carousel element
 * @returns {number} the highest first-card index (so the last card ends flush)
 */
function maxIndex(carousel) {
  const track = carousel.querySelector('.ideas-to-inspire-track');
  const total = track.children.length;
  const visible = getVisible(track);
  return Math.max(0, Math.ceil(total - visible));
}

/**
 * Moves the carousel to the given card index (clamped) and updates UI.
 * @param {Element} carousel The carousel element
 * @param {number} index Target first-card index
 */
function goTo(carousel, index) {
  const track = carousel.querySelector('.ideas-to-inspire-track');
  const max = maxIndex(carousel);
  const next = Math.min(Math.max(0, index), max);
  carousel.dataset.index = next;

  const step = getStep(track);
  track.style.transform = `translateX(-${next * step}px)`;

  const prev = carousel.querySelector('.ideas-to-inspire-arrow-prev');
  const nextBtn = carousel.querySelector('.ideas-to-inspire-arrow-next');
  if (prev) prev.disabled = next <= 0;
  if (nextBtn) nextBtn.disabled = next >= max;

  const fill = carousel.querySelector('.ideas-to-inspire-progress-fill');
  if (fill) {
    const visible = getVisible(track);
    const total = track.children.length;
    const widthPct = Math.min(100, Math.max(12, (visible / total) * 100));
    const progress = max > 0 ? next / max : 0;
    fill.style.width = `${widthPct}%`;
    fill.style.transform = `translateX(${progress * (100 - widthPct)}%)`;
  }
}

/**
 * Adds pointer/touch drag support: follows the finger and snaps to the
 * nearest card on release.
 * @param {Element} carousel The carousel element
 */
function initDrag(carousel) {
  const track = carousel.querySelector('.ideas-to-inspire-track');
  let startX = 0;
  let deltaX = 0;
  let baseOffset = 0;
  let pending = false;
  let dragging = false;
  const DRAG_START = 6;

  const onDown = (e) => {
    pending = true;
    dragging = false;
    startX = e.clientX;
    deltaX = 0;
    const idx = parseInt(carousel.dataset.index || '0', 10);
    baseOffset = idx * getStep(track);
  };

  const onMove = (e) => {
    if (!pending) return;
    deltaX = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(deltaX) < DRAG_START) return;
      dragging = true;
      track.classList.add('is-dragging');
      carousel.setPointerCapture?.(e.pointerId);
    }
    track.style.transform = `translateX(-${baseOffset - deltaX}px)`;
  };

  const onUp = () => {
    if (!pending) return;
    pending = false;
    if (!dragging) return;
    dragging = false;
    track.classList.remove('is-dragging');
    const step = getStep(track) || 1;
    const moved = Math.round(-deltaX / step);
    goTo(carousel, parseInt(carousel.dataset.index || '0', 10) + moved);
  };

  carousel.addEventListener('pointerdown', onDown);
  carousel.addEventListener('pointermove', onMove);
  carousel.addEventListener('pointerup', onUp);
  carousel.addEventListener('pointercancel', onUp);
  carousel.addEventListener('pointerleave', onUp);
  carousel.addEventListener('dragstart', (e) => e.preventDefault());
  // A real drag should not trigger the card link.
  track.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (Math.abs(deltaX) > DRAG_START) e.preventDefault();
    });
  });
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

  // --- Carousel ---
  const carousel = document.createElement('div');
  carousel.className = 'ideas-to-inspire-carousel';
  carousel.dataset.index = '0';

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

  prev.addEventListener('click', () => goTo(carousel, parseInt(carousel.dataset.index || '0', 10) - 1));
  next.addEventListener('click', () => goTo(carousel, parseInt(carousel.dataset.index || '0', 10) + 1));

  // --- Progress bar ---
  const progress = document.createElement('div');
  progress.className = 'ideas-to-inspire-progress';
  const fill = document.createElement('div');
  fill.className = 'ideas-to-inspire-progress-fill';
  progress.append(fill);

  carousel.append(viewport, prev, next, progress);
  block.append(carousel);

  initDrag(carousel);

  const refresh = () => goTo(carousel, parseInt(carousel.dataset.index || '0', 10));
  requestAnimationFrame(refresh);
  window.addEventListener('resize', refresh);
  track.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', refresh, { once: true });
  });
}
