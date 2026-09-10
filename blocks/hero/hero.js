import Splide from '../../scripts/vendor/splide/splide.esm.js';
import { loadCSS } from '../../scripts/aem.js';

loadCSS('/scripts/vendor/splide/splide-core.min.css');

/**
 * loads and decorates the hero
 * @param {Element} block The hero block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  block.textContent = '';

  // --- Left promo ---
  const promoRow = rows[0];
  const cells = [...promoRow.children];
  const promo = document.createElement('div');
  promo.className = 'hero-promo';

  const promoImageCell = cells[0];
  if (promoImageCell) {
    const promoImage = document.createElement('div');
    promoImage.className = 'hero-promo-image';
    while (promoImageCell.firstChild) promoImage.append(promoImageCell.firstChild);
    promo.append(promoImage);
  }

  const promoCardCell = cells[1];
  if (promoCardCell && promoCardCell.textContent.trim()) {
    const card = document.createElement('div');
    card.className = 'hero-promo-card';
    while (promoCardCell.firstChild) card.append(promoCardCell.firstChild);
    promo.append(card);
  }

  // --- Right carousel (using Splide) ---
  const carousel = document.createElement('div');
  carousel.className = 'splide hero-carousel';
  carousel.setAttribute('aria-label', 'Hero Banner Carousel');

  const track = document.createElement('div');
  track.className = 'splide__track';

  const list = document.createElement('ul');
  list.className = 'splide__list hero-slides';

  const slideRows = rows.slice(1);
  slideRows.forEach((row, i) => {
    const slide = document.createElement('li');
    slide.className = 'splide__slide hero-slide';
    slide.dataset.slideIndex = i;

    const slideCells = [...row.children];
    // Image cell — holds the slide media (and any wrapping link).
    const media = document.createElement('div');
    media.className = 'hero-slide-media';
    if (slideCells[0]) while (slideCells[0].firstChild) media.append(slideCells[0].firstChild);

    // Tag responsive images: first = mobile, second = desktop
    const imgs = media.querySelectorAll('img');
    if (imgs.length >= 2) {
      const mobileEl = imgs[0].closest('picture') || imgs[0];
      const desktopEl = imgs[1].closest('picture') || imgs[1];
      mobileEl.classList.add('hero-img-mobile');
      desktopEl.classList.add('hero-img-desktop');
    }

    // Disable native HTML5 drag on media to allow Splide pointer drag
    media.querySelectorAll('img, a').forEach((el) => {
      el.setAttribute('draggable', 'false');
    });

    slide.append(media);

    // Optional overlay cell — heading, description, and CTA button.
    if (slideCells[1] && slideCells[1].textContent.trim()) {
      const info = document.createElement('div');
      info.className = 'hero-slide-info';
      while (slideCells[1].firstChild) info.append(slideCells[1].firstChild);
      info.querySelectorAll('a').forEach((a) => {
        a.classList.add('hero-slide-cta');
        a.setAttribute('draggable', 'false');
      });
      slide.append(info);
    }

    list.append(slide);
  });

  track.append(list);

  if (slideRows.length > 1) {
    const arrows = document.createElement('div');
    arrows.className = 'splide__arrows hero-arrows';

    const prev = document.createElement('button');
    prev.className = 'splide__arrow splide__arrow--prev hero-arrow hero-arrow-prev';
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous slide');

    const next = document.createElement('button');
    next.className = 'splide__arrow splide__arrow--next hero-arrow hero-arrow-next';
    next.type = 'button';
    next.setAttribute('aria-label', 'Next slide');

    arrows.append(prev, next);
    carousel.append(track, arrows);
  } else {
    carousel.append(track);
  }

  block.append(promo, carousel);

  if (slideRows.length > 1) {
    const splide = new Splide(carousel, {
      type: 'loop',
      autoplay: true,
      interval: 5000,
      pauseOnHover: true,
      pauseOnFocus: true,
      arrows: true,
      pagination: true,
      drag: true,
      dragMinThreshold: {
        mouse: 4,
        touch: 10,
      },
      flickPower: 600,
      keyboard: 'focused',
      speed: 600,
    });
    splide.mount();
    requestAnimationFrame(() => {
      splide.refresh();
    });
  }
}
