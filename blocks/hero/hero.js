/**
 * Hero block — Little Farms style.
 * Layout: a left static promo (image + text card) and a right auto-rotating carousel.
 *
 * Content model (positional rows):
 *   Row 1  → left promo: cell 1 = promo image (optionally wrapped in a link),
 *            cell 2 = card content (heading + paragraph text)
 *   Row 2+ → carousel slides: cell 1 = slide image (optionally wrapped in a link)
 *
 * @param {Element} block The hero block element
 */

const AUTOPLAY_MS = 5000;

/**
 * Advances the carousel to the given slide index (wrapping around).
 * @param {Element} carousel The carousel element
 * @param {number} index Target slide index
 */
function showSlide(carousel, index) {
  const slides = carousel.querySelectorAll('.hero-slide');
  if (!slides.length) return;
  const total = slides.length;
  const next = (index + total) % total;
  carousel.dataset.activeSlide = next;

  slides.forEach((slide, i) => {
    slide.setAttribute('aria-hidden', i !== next);
    slide.querySelectorAll('a').forEach((a) => {
      a.tabIndex = i === next ? 0 : -1;
    });
  });

  const dots = carousel.querySelectorAll('.hero-dot');
  dots.forEach((dot, i) => {
    dot.setAttribute('aria-selected', i === next);
  });

  const track = carousel.querySelector('.hero-slides');
  track.style.transform = `translateX(-${next * 100}%)`;
}

/**
 * Wires up autoplay, arrows, dots, and hover-pause on the carousel.
 * @param {Element} carousel The carousel element
 */
function initCarousel(carousel) {
  const slides = carousel.querySelectorAll('.hero-slide');
  if (slides.length <= 1) return;

  let timer;
  const stop = () => clearInterval(timer);
  const start = () => {
    stop();
    timer = setInterval(() => {
      const current = parseInt(carousel.dataset.activeSlide || '0', 10);
      showSlide(carousel, current + 1);
    }, AUTOPLAY_MS);
  };

  carousel.querySelector('.hero-arrow-prev')?.addEventListener('click', () => {
    const current = parseInt(carousel.dataset.activeSlide || '0', 10);
    showSlide(carousel, current - 1);
    start();
  });
  carousel.querySelector('.hero-arrow-next')?.addEventListener('click', () => {
    const current = parseInt(carousel.dataset.activeSlide || '0', 10);
    showSlide(carousel, current + 1);
    start();
  });
  carousel.querySelectorAll('.hero-dot').forEach((dot, i) => {
    dot.addEventListener('click', () => {
      showSlide(carousel, i);
      start();
    });
  });

  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);

  start();
}

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

  // --- Right carousel ---
  const carousel = document.createElement('div');
  carousel.className = 'hero-carousel';
  carousel.dataset.activeSlide = '0';

  const track = document.createElement('div');
  track.className = 'hero-slides';

  const slideRows = rows.slice(1);
  slideRows.forEach((row, i) => {
    const slide = document.createElement('div');
    slide.className = 'hero-slide';
    slide.dataset.slideIndex = i;
    slide.setAttribute('aria-hidden', i !== 0);
    const cell = row.children[0] || row;
    while (cell.firstChild) slide.append(cell.firstChild);
    track.append(slide);
  });
  carousel.append(track);

  if (slideRows.length > 1) {
    const prev = document.createElement('button');
    prev.className = 'hero-arrow hero-arrow-prev';
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous slide');

    const next = document.createElement('button');
    next.className = 'hero-arrow hero-arrow-next';
    next.type = 'button';
    next.setAttribute('aria-label', 'Next slide');

    const dots = document.createElement('div');
    dots.className = 'hero-dots';
    slideRows.forEach((row, i) => {
      const dot = document.createElement('button');
      dot.className = 'hero-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.setAttribute('aria-selected', i === 0);
      dots.append(dot);
    });

    carousel.append(prev, next, dots);
  }

  block.append(promo, carousel);

  showSlide(carousel, 0);
  initCarousel(carousel);
}
