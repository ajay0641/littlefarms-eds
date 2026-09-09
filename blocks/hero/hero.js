/**
 * Hero block — Little Farms style.
 * Layout: a left static promo (image + text card) and a right auto-rotating carousel.
 *
 * Content model (positional rows):
 *   Row 1  → left promo: cell 1 = promo image (optionally wrapped in a link),
 *            cell 2 = card content (heading + paragraph text)
 *   Row 2+ → carousel slides: cell 1 = slide image(s) — a <picture> or two <img>
 *            (mobile + desktop) optionally wrapped in a link; cell 2 (optional)
 *            = overlay content (heading, paragraph, and a link rendered as the
 *            "Shop Now!" button).
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

  initDrag(carousel, start, stop);

  start();
}

/**
 * Adds pointer/touch drag-to-swipe support to the carousel.
 * Follows the finger while dragging and snaps to the nearest slide on release.
 * @param {Element} carousel The carousel element
 * @param {Function} start Restart autoplay
 * @param {Function} stop Pause autoplay
 */
function initDrag(carousel, start, stop) {
  const track = carousel.querySelector('.hero-slides');
  const slides = carousel.querySelectorAll('.hero-slide');
  if (!track || slides.length <= 1) return;

  let startX = 0;
  let deltaX = 0;
  let dragging = false;
  let width = 0;
  // Swipe must exceed this fraction of the carousel width to change slides.
  const THRESHOLD = 0.2;

  // Distance the pointer must travel before a press becomes a drag. Below this,
  // the gesture stays a click so dots and arrows remain interactive.
  const DRAG_START = 6;
  let pending = false;

  const onDown = (e) => {
    // Ignore presses on interactive controls (dots, arrows) so their click fires.
    if (e.target.closest('.hero-dot, .hero-arrow')) return;
    pending = true;
    dragging = false;
    startX = e.clientX;
    deltaX = 0;
    width = carousel.clientWidth || 1;
  };

  const onMove = (e) => {
    if (!pending) return;
    deltaX = e.clientX - startX;

    // Promote to a real drag only once past the threshold.
    if (!dragging) {
      if (Math.abs(deltaX) < DRAG_START) return;
      dragging = true;
      stop();
      track.style.transition = 'none';
      carousel.classList.add('is-dragging');
      carousel.setPointerCapture?.(e.pointerId);
    }

    const current = parseInt(carousel.dataset.activeSlide || '0', 10);
    const percent = (deltaX / width) * 100;
    track.style.transform = `translateX(calc(-${current * 100}% + ${percent}%))`;
  };

  const onUp = () => {
    if (!pending) return;
    pending = false;
    if (!dragging) return;
    dragging = false;
    carousel.classList.remove('is-dragging');
    track.style.transition = '';
    const current = parseInt(carousel.dataset.activeSlide || '0', 10);
    if (Math.abs(deltaX) > width * THRESHOLD) {
      showSlide(carousel, current + (deltaX < 0 ? 1 : -1));
    } else {
      showSlide(carousel, current);
    }
    start();
  };

  carousel.addEventListener('pointerdown', onDown);
  carousel.addEventListener('pointermove', onMove);
  carousel.addEventListener('pointerup', onUp);
  carousel.addEventListener('pointercancel', onUp);
  carousel.addEventListener('pointerleave', onUp);

  // Stop the browser's native image/link drag, which would otherwise fire
  // pointercancel and abort the swipe before it passes the drag threshold.
  carousel.addEventListener('dragstart', (e) => e.preventDefault());
  carousel.querySelectorAll('img, a').forEach((el) => {
    el.setAttribute('draggable', 'false');
  });

  // Prevent the wrapping links from navigating when the user actually dragged.
  carousel.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (Math.abs(deltaX) > DRAG_START) {
        e.preventDefault();
      }
    });
  });
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

    const slideCells = [...row.children];
    // Image cell — holds the slide media (and any wrapping link).
    const media = document.createElement('div');
    media.className = 'hero-slide-media';
    if (slideCells[0]) while (slideCells[0].firstChild) media.append(slideCells[0].firstChild);
    // Tag responsive images: first = mobile, second = desktop (CSS toggles them).
    // Tag the wrapping <picture> when present so the whole element toggles.
    const imgs = media.querySelectorAll('img');
    if (imgs.length >= 2) {
      const mobileEl = imgs[0].closest('picture') || imgs[0];
      const desktopEl = imgs[1].closest('picture') || imgs[1];
      mobileEl.classList.add('hero-img-mobile');
      desktopEl.classList.add('hero-img-desktop');
    }
    slide.append(media);

    // Optional overlay cell — heading, description, and CTA button.
    if (slideCells[1] && slideCells[1].textContent.trim()) {
      const info = document.createElement('div');
      info.className = 'hero-slide-info';
      while (slideCells[1].firstChild) info.append(slideCells[1].firstChild);
      // Turn the overlay link into the "Shop Now!" button.
      info.querySelectorAll('a').forEach((a) => a.classList.add('hero-slide-cta'));
      slide.append(info);
    }

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
