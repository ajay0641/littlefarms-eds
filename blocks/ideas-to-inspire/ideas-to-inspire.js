import Splide from '../../scripts/vendor/splide/splide.esm.js';
import { loadCSS } from '../../scripts/aem.js';

// Load splide core styles
loadCSS('/scripts/vendor/splide/splide-core.min.css');

const CHEVRON_SVG = `
  <svg width="12" height="7" viewBox="0 0 12 7" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.28.22a.75.75,0,0,0-1.06,0L5.75,4.69,1.28.22A.75.75,0,0,0,.22,1.28l5,5a.75.75,0,0,0,1.06,0l5-5A.75.75,0,0,0,11.28.22Z" fill="currentColor"/>
  </svg>
`;

/**
 * loads and decorates the ideas-to-inspire block using Splide
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  block.textContent = '';

  // 1. Heading row
  const headingRow = rows[0];
  const heading = document.createElement('div');
  heading.className = 'ideas-to-inspire-heading';
  while (headingRow.firstChild) {
    heading.append(headingRow.firstChild);
  }
  block.append(heading);

  // 2. Splide HTML structure
  const splideEl = document.createElement('div');
  splideEl.className = 'splide ideas-to-inspire-splide';
  splideEl.setAttribute('aria-label', 'Ideas to Inspire');

  const track = document.createElement('div');
  track.className = 'splide__track';

  const list = document.createElement('ul');
  list.className = 'splide__list';

  // 3. Slides
  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    const link = cells[0]?.querySelector('a');
    const media = cells[0]?.querySelector('picture, img');
    if (!media) return;

    const href = link?.getAttribute('href') || '#';
    const slide = document.createElement('li');
    slide.className = 'splide__slide';

    const card = document.createElement('a');
    card.className = 'ideas-to-inspire-card';
    card.setAttribute('href', href);

    const imageWrapper = document.createElement('span');
    imageWrapper.className = 'ideas-to-inspire-image';
    imageWrapper.append(media);
    card.append(imageWrapper);

    const titleText = (cells[1]?.textContent || link?.textContent || media.querySelector('img')?.alt || '').trim();
    if (titleText) {
      const title = document.createElement('span');
      title.className = 'ideas-to-inspire-title';
      title.textContent = titleText;
      card.append(title);
    }

    card.setAttribute('aria-label', titleText || 'Idea');
    slide.append(card);
    list.append(slide);
  });

  track.append(list);

  // 4. Custom arrows
  const arrows = document.createElement('div');
  arrows.className = 'splide__arrows splide__arrows--ltr';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'splide__arrow splide__arrow--prev ideas-to-inspire-arrow ideas-to-inspire-arrow-prev';
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.innerHTML = CHEVRON_SVG;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'splide__arrow splide__arrow--next ideas-to-inspire-arrow ideas-to-inspire-arrow-next';
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.innerHTML = CHEVRON_SVG;

  arrows.append(prevBtn, nextBtn);
  splideEl.append(track, arrows);
  block.append(splideEl);

  // 5. Initialize Splide with littlefarms.com specs
  const splide = new Splide(splideEl, {
    type: 'slide',
    rewind: false,
    perPage: 4,
    perMove: 4,
    gap: '20px',
    padding: { right: '20px' },
    arrows: true,
    pagination: true,
    drag: true,
    keyboard: 'focused',
    speed: 400,
    breakpoints: {
      1199: {
        perPage: 3,
        perMove: 3,
        padding: { right: '20px' },
        gap: '20px',
      },
      768: {
        perPage: 3,
        perMove: 3,
        padding: { right: '30px' },
        arrows: false,
        gap: '15px',
      },
      560: {
        perPage: 1,
        perMove: 1,
        padding: { right: '102px' },
        arrows: false,
        gap: '15px',
      },
    },
  });

  splide.mount();
  requestAnimationFrame(() => {
    splide.refresh();
  });
}
