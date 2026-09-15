import Splide from '../../scripts/vendor/splide/splide.esm.js';
import { loadCSS } from '../../scripts/aem.js';

loadCSS('/scripts/vendor/splide/splide-core.min.css');

/**
 * loads and decorates the category-icons block using Splide
 * @param {Element} block The category-icons block element
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

  // --- Splide Carousel of items ---
  const splideEl = document.createElement('div');
  splideEl.className = 'splide category-icons-splide';
  splideEl.setAttribute('aria-label', 'Shop by Aisle');

  const track = document.createElement('div');
  track.className = 'splide__track category-icons-viewport';

  const list = document.createElement('ul');
  list.className = 'splide__list category-icons-track';

  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    const link = cells[0]?.querySelector('a');
    const img = cells[0]?.querySelector('img, picture');
    if (!img) return;

    const slide = document.createElement('li');
    slide.className = 'splide__slide category-icons-slide';

    const item = document.createElement('a');
    item.className = 'category-icons-item';
    item.setAttribute('draggable', 'false');
    const href = link?.getAttribute('href');
    if (href) item.setAttribute('href', href);

    const iconWrap = document.createElement('span');
    iconWrap.className = 'category-icons-icon';
    const realImg = img.querySelector('img') || img;
    if (realImg) realImg.setAttribute('draggable', 'false');
    iconWrap.append(img);
    item.append(iconWrap);

    const labelText = (cells[1]?.textContent || link?.textContent || img.querySelector('img')?.alt || '').trim();
    if (labelText) {
      const label = document.createElement('span');
      label.className = 'category-icons-label';
      label.textContent = labelText;
      item.append(label);
    }

    slide.append(item);
    list.append(slide);
  });

  track.append(list);

  const arrows = document.createElement('div');
  arrows.className = 'splide__arrows category-icons-arrows';

  const prev = document.createElement('button');
  prev.className = 'splide__arrow splide__arrow--prev category-icons-arrow category-icons-arrow-prev';
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Scroll left');

  const next = document.createElement('button');
  next.className = 'splide__arrow splide__arrow--next category-icons-arrow category-icons-arrow-next';
  next.type = 'button';
  next.setAttribute('aria-label', 'Scroll right');

  arrows.append(prev, next);
  splideEl.append(track, arrows);

  block.append(header, splideEl);

  const splide = new Splide(splideEl, {
    type: 'slide',
    rewind: false,
    perPage: 9,
    perMove: 4,
    gap: '16px',
    pagination: false,
    arrows: true,
    drag: true,
    speed: 400,
    breakpoints: {
      1200: {
        perPage: 8,
        perMove: 4,
        gap: '16px',
      },
      1024: {
        perPage: 6,
        perMove: 3,
        gap: '16px',
      },
      768: {
        perPage: 4,
        perMove: 2,
        gap: '12px',
      },
      480: {
        perPage: 4,
        perMove: 2,
        gap: '8px',
      },
    },
  });

  splide.mount();
  requestAnimationFrame(() => {
    splide.refresh();
  });
}
