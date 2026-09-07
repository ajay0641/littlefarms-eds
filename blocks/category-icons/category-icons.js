/**
 * Category Icons ("Shop by Aisle") block.
 * A heading row with an optional "Shop all" link, followed by a horizontally
 * scrollable row of circular icon + label items with prev/next arrows.
 *
 * Content model (positional rows):
 *   Row 1  → cell 1 = section heading; cell 2 (optional) = "Shop all" link
 *   Row 2+ → each row is one item: cell 1 = icon image (wrapped in a link),
 *            cell 2 (optional) = label text (falls back to the link text)
 *
 * @param {Element} block The category-icons block element
 */

/**
 * Scrolls the track by roughly one viewport width in the given direction.
 * @param {Element} track The scrolling track element
 * @param {number} dir -1 for previous, 1 for next
 */
function scrollTrack(track, dir) {
  const amount = track.clientWidth * 0.8;
  track.scrollBy({ left: dir * amount, behavior: 'smooth' });
}

/**
 * Toggles the disabled state of the arrows based on scroll position.
 * @param {Element} block The block element
 */
function updateArrows(block) {
  const track = block.querySelector('.category-icons-track');
  const prev = block.querySelector('.category-icons-arrow-prev');
  const next = block.querySelector('.category-icons-arrow-next');
  if (!track || !prev || !next) return;
  const maxScroll = track.scrollWidth - track.clientWidth - 1;
  prev.disabled = track.scrollLeft <= 0;
  next.disabled = track.scrollLeft >= maxScroll;
}

/**
 * loads and decorates the category-icons block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  block.textContent = '';

  // --- Header (heading + optional Shop all link) ---
  const headerRow = rows[0];
  const headerCells = [...headerRow.children];
  const header = document.createElement('div');
  header.className = 'category-icons-header';

  const heading = document.createElement('div');
  heading.className = 'category-icons-heading';
  if (headerCells[0]) {
    while (headerCells[0].firstChild) heading.append(headerCells[0].firstChild);
  }
  header.append(heading);

  if (headerCells[1] && headerCells[1].textContent.trim()) {
    const shopAll = document.createElement('div');
    shopAll.className = 'category-icons-shopall';
    while (headerCells[1].firstChild) shopAll.append(headerCells[1].firstChild);
    header.append(shopAll);
  }

  // --- Track of items ---
  const viewport = document.createElement('div');
  viewport.className = 'category-icons-viewport';

  const track = document.createElement('div');
  track.className = 'category-icons-track';

  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    const link = cells[0]?.querySelector('a');
    const img = cells[0]?.querySelector('img, picture');
    if (!img) return;

    const item = document.createElement('a');
    item.className = 'category-icons-item';
    const href = link?.getAttribute('href');
    if (href) item.setAttribute('href', href);

    const iconWrap = document.createElement('span');
    iconWrap.className = 'category-icons-icon';
    iconWrap.append(img);
    item.append(iconWrap);

    const labelText = (cells[1]?.textContent || link?.textContent || img.querySelector('img')?.alt || '').trim();
    if (labelText) {
      const label = document.createElement('span');
      label.className = 'category-icons-label';
      label.textContent = labelText;
      item.append(label);
    }

    track.append(item);
  });

  viewport.append(track);

  // --- Arrows ---
  const prev = document.createElement('button');
  prev.className = 'category-icons-arrow category-icons-arrow-prev';
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Scroll left');

  const next = document.createElement('button');
  next.className = 'category-icons-arrow category-icons-arrow-next';
  next.type = 'button';
  next.setAttribute('aria-label', 'Scroll right');

  prev.addEventListener('click', () => scrollTrack(track, -1));
  next.addEventListener('click', () => scrollTrack(track, 1));
  track.addEventListener('scroll', () => updateArrows(block));
  window.addEventListener('resize', () => updateArrows(block));

  block.append(header, viewport, prev, next);

  // Evaluate arrows after layout settles (scrollWidth needs a rendered track).
  requestAnimationFrame(() => updateArrows(block));

  // Re-evaluate arrows once icons have loaded (they affect scrollWidth).
  track.querySelectorAll('img').forEach((img) => {
    if (!img.complete) {
      img.addEventListener('load', () => updateArrows(block), { once: true });
    }
  });
}
