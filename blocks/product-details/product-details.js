import {
  InLineAlert,
  Icon,
  provider as UI,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import * as pdpApi from '@dropins/storefront-pdp/api.js';
import { render as pdpRendered } from '@dropins/storefront-pdp/render.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';

import { WishlistToggle } from '@dropins/storefront-wishlist/containers/WishlistToggle.js';
import { WishlistAlert } from '@dropins/storefront-wishlist/containers/WishlistAlert.js';

// Containers
import ProductHeader from '@dropins/storefront-pdp/containers/ProductHeader.js';
import ProductPrice from '@dropins/storefront-pdp/containers/ProductPrice.js';
import ProductShortDescription from '@dropins/storefront-pdp/containers/ProductShortDescription.js';
import ProductOptions from '@dropins/storefront-pdp/containers/ProductOptions.js';
import ProductDescription from '@dropins/storefront-pdp/containers/ProductDescription.js';
import ProductAttributes from '@dropins/storefront-pdp/containers/ProductAttributes.js';
import ProductGallery from '@dropins/storefront-pdp/containers/ProductGallery.js';
import ProductGiftCardOptions from '@dropins/storefront-pdp/containers/ProductGiftCardOptions.js';

// Libs
import {
  rootLink,
  setJsonLd,
  fetchPlaceholders,
  getProductLink,
  checkIsAuthenticated,
} from '../../scripts/commerce.js';
import {
  showWishlistLoginToast,
} from '../../scripts/components/tfs-wishlist-toast/tfs-wishlist-toast.js';
import { showWishlistAuthModal } from '../../scripts/wishlist-auth-modal.js';

// Initializers
import { IMAGES_SIZES } from '../../scripts/initializers/pdp.js';
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/wishlist.js';

/**
 * Checks if the page has prerendered product JSON-LD data
 * @returns {boolean} True if product JSON-LD exists and contains @type=Product
 */
function isProductPrerendered() {
  const jsonLdScript = document.querySelector('script[type="application/ld+json"]');

  if (!jsonLdScript?.textContent) {
    return false;
  }

  try {
    const jsonLd = JSON.parse(jsonLdScript.textContent);
    return jsonLd?.['@type'] === 'Product';
  } catch (error) {
    console.debug('Failed to parse JSON-LD:', error);
    return false;
  }
}

// Function to update the Add to Cart button text
function updateAddToCartButtonText(buttonEl, inCart, labels) {
  const buttonText = inCart
    ? (labels?.Global?.UpdateProductInCart ?? 'Update Cart')
    : (labels?.Global?.AddProductToCart ?? 'Add to Cart');
  if (buttonEl) {
    const textSpan = buttonEl.querySelector('span');
    if (textSpan) {
      textSpan.textContent = buttonText;
    } else {
      buttonEl.textContent = buttonText;
    }
  }
}

/**
 * Formats numeric attribute values for display (e.g., "10.000000" → "10").
 * Non-numeric values are returned as-is.
 */
function formatNumericAttributeValue(value) {
  const trimmed = value.trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return value;
  return new Intl.NumberFormat(document.documentElement.lang).format(Number(trimmed));
}

/**
 * Enables interactive hover zoom on the active desktop gallery slide.
 * Clicking the image opens the pdp-overlay modal.
 * @param {Element} galleryEl The desktop gallery container element
 */
function initGalleryHoverZoom(galleryEl) {
  if (!galleryEl) return;

  const resetZoom = (img) => {
    if (!img) return;
    img.style.transform = 'scale(1)';
    img.style.transformOrigin = 'center center';
  };

  galleryEl.addEventListener('mousemove', (e) => {
    if (e.target.closest('.pdp-overlay')) return;
    const slide = e.target.closest('.pdp-carousel__slide--active');
    if (!slide) return;
    const img = slide.querySelector('img');
    if (!img) return;

    const rect = slide.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    img.style.transformOrigin = `${x}% ${y}%`;
    img.style.transform = 'scale(1.5)';
  });

  galleryEl.addEventListener('mouseleave', (e) => {
    if (e.target.closest?.('.pdp-overlay')) return;
    const activeImg = galleryEl.querySelector('.pdp-carousel__slide--active img');
    resetZoom(activeImg);
  }, true);

  galleryEl.addEventListener('mouseout', (e) => {
    if (e.target.closest?.('.pdp-overlay')) return;
    const slide = e.target.closest('.pdp-carousel__slide');
    if (slide && !slide.contains(e.relatedTarget)) {
      const img = slide.querySelector('img');
      resetZoom(img);
    }
  });
}

/**
 * Enables smooth mouse and touch drag navigation on the overlay carousel slides.
 * @param {Element} overlay The overlay container element
 */
function initOverlayDraggable(overlay) {
  const wrapper = overlay.querySelector('.pdp-carousel__wrapper');
  if (!wrapper || wrapper.dataset.dragInit === 'true') return;
  wrapper.dataset.dragInit = 'true';

  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let startTime = 0;
  let hasMoved = false;

  const onPointerMove = (e) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) {
      hasMoved = true;
    }
    wrapper.scrollLeft = startScrollLeft - dx;
  };

  const onPointerUp = (e) => {
    if (!isDown) return;
    isDown = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    wrapper.style.cursor = '';
    wrapper.style.scrollSnapType = '';
    wrapper.style.scrollBehavior = 'smooth';

    if (hasMoved) {
      const slideWidth = wrapper.offsetWidth || wrapper.clientWidth || 1;
      const dx = e.clientX - startX;
      const dt = Math.max(1, Date.now() - startTime);
      const velocity = Math.abs(dx) / dt;

      const activeSlide = overlay.querySelector('.pdp-carousel__slide--active');
      const currentIndex = activeSlide
        ? Number(activeSlide.getAttribute('data-index'))
        : Math.round(startScrollLeft / slideWidth);

      const slides = overlay.querySelectorAll('.pdp-carousel__slide');
      const maxIndex = Math.max(0, slides.length - 1);

      let targetIndex = currentIndex;
      if (Math.abs(dx) > 40 || velocity > 0.25) {
        const steps = Math.max(1, Math.round(Math.abs(dx) / slideWidth));
        if (dx < 0) {
          targetIndex = Math.min(maxIndex, currentIndex + steps);
        } else if (dx > 0) {
          targetIndex = Math.max(0, currentIndex - steps);
        }
      }

      const buttons = overlay.querySelectorAll('.pdp-carousel__controls__button');
      if (buttons && buttons[targetIndex]) {
        buttons[targetIndex].click();
      } else {
        wrapper.scrollTo({ left: targetIndex * slideWidth, behavior: 'smooth' });
      }

      setTimeout(() => {
        hasMoved = false;
      }, 50);
    }
  };

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDown = true;
    hasMoved = false;
    startX = e.clientX;
    startScrollLeft = wrapper.scrollLeft;
    startTime = Date.now();
    wrapper.style.cursor = 'grabbing';
    wrapper.style.scrollBehavior = 'auto';
    wrapper.style.scrollSnapType = 'none';

    e.preventDefault();

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  wrapper.addEventListener('pointerdown', onPointerDown);

  wrapper.addEventListener('click', (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

/**
 * Populates thumbnail images into the overlay carousel control buttons on desktop,
 * while keeping them as dots on mobile.
 * @param {Element} containerEl The container element to observe
 */
function initOverlayThumbnails(containerEl) {
  if (!containerEl) return;

  const updateOverlayThumbs = () => {
    const overlay = containerEl.querySelector('.pdp-overlay');
    if (!overlay) return;

    initOverlayDraggable(overlay);

    const buttons = overlay.querySelectorAll('.pdp-carousel__controls__button');
    if (!buttons.length) return;

    const isDesktop = window.innerWidth >= 768;
    if (!isDesktop) {
      buttons.forEach((btn) => {
        const thumb = btn.querySelector('.pdp-carousel__thumbnail__span, img');
        if (thumb) thumb.remove();
      });
      return;
    }

    const desktopThumbs = containerEl.querySelectorAll('.product-details__left-column .pdp-carousel__thumbnail__span');

    buttons.forEach((btn, index) => {
      if (btn.querySelector('img')) return;
      const sourceThumb = desktopThumbs[index];
      if (sourceThumb) {
        const clone = sourceThumb.cloneNode(true);
        const cloneImg = clone.querySelector('img');
        if (cloneImg) cloneImg.draggable = false;
        btn.appendChild(clone);
      } else {
        const slideImg = containerEl.querySelectorAll('.product-details__left-column .pdp-carousel__slide img')[index];
        if (slideImg) {
          const img = document.createElement('img');
          img.src = slideImg.src;
          img.alt = slideImg.alt || '';
          img.draggable = false;
          btn.appendChild(img);
        }
      }
    });
  };

  const observer = new MutationObserver(updateOverlayThumbs);
  observer.observe(containerEl, { childList: true, subtree: true });
  window.addEventListener('resize', updateOverlayThumbs);
}

/**
 * Enables thumbnail navigation arrows and edge shadows when thumbnails overflow.
 * @param {Element} galleryEl The desktop gallery element
 */
function initThumbnailOverflowNav(galleryEl) {
  if (!galleryEl) return;

  const setupNav = () => {
    const wrapper = galleryEl.querySelector('.pdp-carousel__controls__wrapper--thumbnailsRow');
    const controls = galleryEl.querySelector('.pdp-carousel__controls--thumbnailsRow');
    if (!wrapper || !controls) return;

    [-1, 1].forEach((dir) => {
      const cls = dir === -1 ? 'prev' : 'next';
      if (!wrapper.querySelector(`.pdp-carousel__thumb-nav--${cls}`)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `pdp-carousel__thumb-nav pdp-carousel__thumb-nav--${cls}`;
        btn.setAttribute('aria-label', `${dir === -1 ? 'Previous' : 'Next'} thumbnails`);
        btn.innerHTML = `<svg width="12" height="20" viewBox="0 0 12 20" fill="none"><path d="${dir === -1 ? 'M10 2L2 10L10 18' : 'M2 2L10 10L2 18'}" stroke="#3a3a3a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const step = (controls.querySelector('.pdp-carousel__thumbnail__container')?.offsetWidth || 80) + 10;
          controls.scrollBy({ left: dir * step, behavior: 'smooth' });
        });
        wrapper.appendChild(btn);
      }
    });

    const updateState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = controls;
      const maxScroll = scrollWidth - clientWidth;
      const hasOverflow = maxScroll > 2;
      const showLeft = hasOverflow && scrollLeft > 2;
      const showRight = hasOverflow && scrollLeft < maxScroll - 2;

      wrapper.querySelector('.pdp-carousel__thumb-nav--prev')?.classList.toggle('is-visible', showLeft);
      wrapper.querySelector('.pdp-carousel__thumb-nav--next')?.classList.toggle('is-visible', showRight);
      wrapper.classList.toggle('has-shadow-left', showLeft);
      wrapper.classList.toggle('has-shadow-right', showRight);
    };

    if (!controls.dataset.thumbNavInit) {
      controls.dataset.thumbNavInit = 'true';
      controls.addEventListener('scroll', updateState, { passive: true });
      window.addEventListener('resize', updateState);
      if (window.ResizeObserver) new ResizeObserver(updateState).observe(controls);

      let startX = 0;
      let scrollStart = 0;
      let moved = false;

      controls.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        startX = e.clientX;
        scrollStart = controls.scrollLeft;
        moved = false;
      });

      window.addEventListener('pointermove', (e) => {
        if (!e.buttons) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) {
          moved = true;
          controls.scrollLeft = scrollStart - dx;
        }
      });

      controls.addEventListener('click', (e) => {
        if (moved) e.stopPropagation();
      }, true);
    }

    updateState();
  };

  new MutationObserver(setupNav).observe(galleryEl, { childList: true, subtree: true });
  setupNav();
}

export default async function decorate(block) {
  document.body.classList.add('product-details-page');
  const eventProduct = events.lastPayload('pdp/data') ?? null;
  // bug: the pdp sends an object with event data even if product is not found.
  const product = eventProduct?.sku ? eventProduct : null;

  const labels = await fetchPlaceholders();

  // Read itemUid from URL
  const urlParams = new URLSearchParams(window.location.search);
  const itemUidFromUrl = urlParams.get('itemUid');

  // State to track if we are in update mode
  let isUpdateMode = false;

  // State to track if the current product/variant is out of stock
  let isOutOfStock = false;

  // Layout
  const fragment = document.createRange().createContextualFragment(`
    <div class="product-details__alert"></div>
    <div class="product-details__wrapper">
      <div class="product-details__left-column">
        <div class="product-details__gallery-box">
          <div class="product-details__gallery"></div>
          <div class="product-details__wishlist-toggle product-details__wishlist-toggle--desktop"></div>
        </div>
      </div>
      <div class="product-details__right-column">
        <div class="product-details__gallery-box">
          <div class="product-details__gallery"></div>
          <div class="product-details__wishlist-toggle product-details__wishlist-toggle--mobile"></div>
        </div>
        <div class="product-details__header"></div>
        <div class="product-details__price"></div>
        <div class="product-details__gift-card-options"></div>
        <div class="product-details__configuration">
          <div class="product-details__options"></div>
          <div class="product-add-wrap">
            <div class="product-add-form">
              <div class="box-tocart">
                <div class="fieldset">
                  <div class="addtocart-qty-block" style="display: none;">
                    <button type="button" class="action decrease" aria-label="Decrease quantity">
                      <span class="minus"></span>
                    </button>
                    <div class="input-text qty">
                      <input type="number" min="0" value="1" class="input-text" aria-label="Quantity" />
                    </div>
                    <button type="button" class="action increase" aria-label="Increase quantity">
                      <span class="plus"></span>
                    </button>
                  </div>
                  <div class="actions">
                    <button type="button" class="action primary tocart" id="product-addtocart-button">
                      <span>Add to Cart</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="product-details__wishlist-toggle product-details__wishlist-toggle--add-wrap"></div>
          </div>
          <div class="product-details__add-to-cart-status" role="status" aria-live="polite"></div>
        </div>
        <div class="product-details__short-description-group" hidden>
          <h2 class="product-details__short-description-title">Overview</h2>
          <div class="product-details__short-description"></div>
        </div>
        <div class="product-details__accordion" hidden>
          <div class="product-details__accordion-item product-details__accordion-item--description active" hidden>
            <button type="button" class="product-details__accordion-header" aria-expanded="true" aria-controls="product-details-accordion-desc">
              <span class="product-details__accordion-title">Product Description</span>
            </button>
            <div id="product-details-accordion-desc" class="product-details__accordion-content" role="region">
              <div class="product-details__description"></div>
            </div>
          </div>
          <div class="product-details__accordion-item product-details__accordion-item--details active" hidden>
            <button type="button" class="product-details__accordion-header" aria-expanded="true" aria-controls="product-details-accordion-details">
              <span class="product-details__accordion-title">Details</span>
            </button>
            <div id="product-details-accordion-details" class="product-details__accordion-content" role="region">
              <div class="product-details__attributes"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);

  const $alert = fragment.querySelector('.product-details__alert');
  const $gallery = fragment.querySelector('.product-details__left-column .product-details__gallery');
  const $wishlistToggleDesktop = fragment.querySelector('.product-details__left-column .product-details__wishlist-toggle--desktop');
  const $header = fragment.querySelector('.product-details__header');
  const $price = fragment.querySelector('.product-details__price');
  const $galleryMobile = fragment.querySelector('.product-details__right-column .product-details__gallery');
  const $wishlistToggleMobile = fragment.querySelector('.product-details__wishlist-toggle--mobile');
  const $wishlistToggleAddWrap = fragment.querySelector('.product-add-wrap .product-details__wishlist-toggle--add-wrap');
  const $shortDescriptionGroup = fragment.querySelector('.product-details__short-description-group');
  const $shortDescription = fragment.querySelector('.product-details__short-description');
  const $options = fragment.querySelector('.product-details__options');
  const $giftCardOptions = fragment.querySelector('.product-details__gift-card-options');
  const $qtyBlock = fragment.querySelector('.addtocart-qty-block');
  const $atcButton = fragment.querySelector('#product-addtocart-button');
  const $decBtn = fragment.querySelector('.addtocart-qty-block .action.decrease');
  const $incBtn = fragment.querySelector('.addtocart-qty-block .action.increase');
  const $qtyInput = fragment.querySelector('.addtocart-qty-block .input-text.qty input');
  // Kept mounted at all times so the "Adding to Cart" status is reliably
  // announced instead of relying on the button's text/disabled state
  // changing, which isn't announced by screen readers on its own.
  const $addToCartStatus = fragment.querySelector('.product-details__add-to-cart-status');
  const $accordion = fragment.querySelector('.product-details__accordion');
  const $descAccordionItem = fragment.querySelector('.product-details__accordion-item--description');
  const $detailsAccordionItem = fragment.querySelector('.product-details__accordion-item--details');
  const $description = fragment.querySelector('.product-details__description');
  const $attributes = fragment.querySelector('.product-details__attributes');

  const accordionHeaders = fragment.querySelectorAll('.product-details__accordion-header');
  accordionHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.closest('.product-details__accordion-item');
      if (!item) return;
      const isOpen = item.classList.contains('active');
      if (isOpen) {
        item.classList.remove('active');
        header.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('active');
        header.setAttribute('aria-expanded', 'true');
      }
    });
  });

  const updateAccordionVisibility = (data) => {
    if ($shortDescriptionGroup) {
      const hasShortDesc = Boolean(
        data?.shortDescription && data.shortDescription.replace(/<[^>]*>/g, '').trim().length > 0,
      );
      $shortDescriptionGroup.hidden = !hasShortDesc;
    }
    const hasDesc = Boolean(
      data?.description && data.description.replace(/<[^>]*>/g, '').trim().length > 0,
    );
    if ($descAccordionItem) {
      $descAccordionItem.hidden = !hasDesc;
    }

    const hasAttrs = Boolean(
      data?.attributes?.some((attr) => !attr.id?.startsWith('ac_') && Boolean(attr.value)),
    );
    if ($detailsAccordionItem) {
      $detailsAccordionItem.hidden = !hasAttrs;
    }

    if ($accordion) {
      $accordion.hidden = !hasDesc && !hasAttrs;
    }
  };

  updateAccordionVisibility(product);

  block.replaceChildren(fragment);

  const gallerySlots = {
    CarouselThumbnail: (ctx) => {
      if (ctx.mediaType === 'image') {
        tryRenderAemAssetsImage(ctx, {
          ...imageSlotConfig(ctx),
          wrapper: document.createElement('span'),
        });
      }
    },

    CarouselMainImage: (ctx) => {
      if (ctx.mediaType === 'image') {
        tryRenderAemAssetsImage(ctx, {
          ...imageSlotConfig(ctx),
        });
      }
    },
  };

  // Alert
  let inlineAlert = null;
  const routeToWishlist = rootLink('/wishlist');

  const [
    _galleryMobile,
    _gallery,
    _header,
    _price,
    _shortDescription,
    _options,
    _giftCardOptions,
    _description,
    _attributes,
    wishlistDesktop,
    wishlistMobile,
    wishlistAddWrap,
  ] = await Promise.all([
    // Gallery (Mobile)
    pdpRendered.render(ProductGallery, {
      controls: 'dots',
      arrows: false,
      peak: false,
      gap: 'small',
      loop: false,
      videos: true, // Display videos if available
      imageParams: {
        ...IMAGES_SIZES,
      },

      slots: gallerySlots,
    })($galleryMobile),

    // Gallery (Desktop)
    pdpRendered.render(ProductGallery, {
      controls: 'thumbnailsRow',
      arrows: false,
      peak: false,
      gap: 'small',
      loop: false,
      videos: true, // Display videos if available
      imageParams: {
        ...IMAGES_SIZES,
      },
      thumbnailParams: {
        width: 100,
        height: 100,
      },

      slots: gallerySlots,
    })($gallery),

    // Header
    pdpRendered.render(ProductHeader, {
      hideSku: true,
    })($header),

    // Price
    pdpRendered.render(ProductPrice, {})($price),

    // Short Description
    pdpRendered.render(ProductShortDescription, {})($shortDescription),

    // Configuration - Swatches
    pdpRendered.render(ProductOptions, {
      hideSelectedValue: false,
      slots: {
        SwatchImage: (ctx) => {
          tryRenderAemAssetsImage(ctx, {
            ...imageSlotConfig(ctx),
            wrapper: document.createElement('span'),
          });
        },
      },
    })($options),

    // Configuration  Gift Card Options
    pdpRendered.render(ProductGiftCardOptions, {})($giftCardOptions),

    // Description
    pdpRendered.render(ProductDescription, {})($description),

    // Attributes
    pdpRendered.render(ProductAttributes, {
      formatValue: formatNumericAttributeValue,
    })($attributes),

    // Wishlist button (Desktop Gallery)
    wishlistRender.render(WishlistToggle, {
      product,
    })($wishlistToggleDesktop),

    // Wishlist button (Mobile Gallery)
    wishlistRender.render(WishlistToggle, {
      product,
    })($wishlistToggleMobile),

    // Wishlist button (Shopping List in product-add-wrap)
    wishlistRender.render(WishlistToggle, {
      product,
      labelToWishlist: 'Add to Shopping List',
      labelWishlisted: 'Add to Shopping List',
    })($wishlistToggleAddWrap),
  ]);

  const handleWishlistClick = (e) => {
    if (!checkIsAuthenticated()) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showWishlistLoginToast(() => {
        showWishlistAuthModal();
      });
    }
  };

  [$wishlistToggleDesktop, $wishlistToggleMobile, $wishlistToggleAddWrap].forEach(($toggle) => {
    $toggle?.addEventListener('click', handleWishlistClick, true);
  });

  initGalleryHoverZoom($gallery);
  initOverlayThumbnails(block);
  initThumbnailOverflowNav($gallery);

  // Disable native image dragging across gallery and modal
  block.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  });
  document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG' && (e.target.closest('.pdp-overlay') || e.target.closest('.product-details'))) {
      e.preventDefault();
    }
  });

  // Configuration – Add to Cart & Quantity Stepper
  let currentCartItemUid = null;
  let currentCartQty = 0;
  let isActionInProgress = false;
  let lastCartData = null;

  const getMatchingCartItem = (cartData) => {
    if (!cartData?.items?.length) return null;
    const configValues = pdpApi.getProductConfigurationValues();
    const targetSku = configValues?.sku || product.sku;
    if (itemUidFromUrl) {
      const matchedByUid = cartData.items.find((item) => item.uid === itemUidFromUrl);
      if (matchedByUid) return matchedByUid;
    }
    return cartData.items.find((item) => item.sku === targetSku);
  };

  const syncWithCart = (cartData) => {
    lastCartData = cartData;
    const cartItem = getMatchingCartItem(cartData);
    const itemIsInCart = Boolean(cartItem && cartItem.quantity > 0);
    isUpdateMode = itemIsInCart;

    if (itemIsInCart) {
      currentCartItemUid = cartItem.uid;
      currentCartQty = cartItem.quantity;
      if ($qtyInput) $qtyInput.value = currentCartQty;
      if ($qtyBlock) $qtyBlock.style.display = 'flex';
      if ($atcButton) $atcButton.style.display = 'none';
    } else {
      currentCartItemUid = null;
      currentCartQty = 0;
      if ($qtyInput) $qtyInput.value = '1';
      if ($qtyBlock) $qtyBlock.style.display = 'none';
      if ($atcButton) {
        $atcButton.style.display = '';
        updateAddToCartButtonText($atcButton, false, labels);
      }
    }
  };

  if ($atcButton) {
    updateAddToCartButtonText($atcButton, isUpdateMode, labels);
    $atcButton.addEventListener('click', async () => {
      if (isOutOfStock || isActionInProgress) return;
      const valid = pdpApi.isProductConfigurationValid();
      if (!valid) return;

      isActionInProgress = true;
      $atcButton.disabled = true;
      const buttonActionText = isUpdateMode
        ? (labels.Global?.UpdatingInCart ?? 'Updating in Cart')
        : (labels.Global?.AddingToCart ?? 'Adding to Cart');
      const textSpan = $atcButton.querySelector('span');
      if (textSpan) textSpan.textContent = buttonActionText;
      $addToCartStatus.textContent = buttonActionText;

      try {
        const values = pdpApi.getProductConfigurationValues();
        if (isUpdateMode && itemUidFromUrl) {
          const { updateProductsFromCart } = await import(
            '@dropins/storefront-cart/api.js'
          );
          await updateProductsFromCart([{ ...values, uid: itemUidFromUrl }]);
          const updatedSku = values?.sku;
          if (updatedSku) {
            const cartRedirectUrl = new URL(
              rootLink('/cart'),
              window.location.origin,
            );
            cartRedirectUrl.searchParams.set('itemUid', itemUidFromUrl);
            window.location.href = cartRedirectUrl.toString();
          } else {
            window.location.href = rootLink('/cart');
          }
          return;
        }

        const { addProductsToCart } = await import(
          '@dropins/storefront-cart/api.js'
        );
        const newCart = await addProductsToCart([{ ...values, quantity: 1 }]);
        inlineAlert?.remove();
        if (newCart) {
          syncWithCart(newCart);
        }
      } catch (error) {
        inlineAlert = await UI.render(InLineAlert, {
          heading: 'Error',
          description: error.message,
          icon: h(Icon, { source: 'Warning' }),
          'aria-live': 'assertive',
          role: 'alert',
          onDismiss: () => {
            inlineAlert.remove();
          },
        })($alert);

        $alert.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      } finally {
        isActionInProgress = false;
        updateAddToCartButtonText($atcButton, isUpdateMode, labels);
        $atcButton.disabled = isOutOfStock;
        $addToCartStatus.textContent = '';
      }
    });
  }

  const updateQuantity = async (targetQty) => {
    if (isActionInProgress || !currentCartItemUid) return;
    isActionInProgress = true;
    if ($decBtn) $decBtn.disabled = true;
    if ($incBtn) $incBtn.disabled = true;
    if ($qtyInput) $qtyInput.disabled = true;

    try {
      const { updateProductsFromCart } = await import(
        '@dropins/storefront-cart/api.js'
      );
      const newCart = await updateProductsFromCart([
        { uid: currentCartItemUid, quantity: targetQty },
      ]);
      inlineAlert?.remove();
      if (newCart) {
        syncWithCart(newCart);
      }
    } catch (error) {
      inlineAlert = await UI.render(InLineAlert, {
        heading: 'Error',
        description: error.message,
        icon: h(Icon, { source: 'Warning' }),
        'aria-live': 'assertive',
        role: 'alert',
        onDismiss: () => {
          inlineAlert.remove();
        },
      })($alert);

      $alert.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      if ($qtyInput) $qtyInput.value = currentCartQty;
    } finally {
      isActionInProgress = false;
      if ($decBtn) $decBtn.disabled = isOutOfStock;
      if ($incBtn) $incBtn.disabled = isOutOfStock;
      if ($qtyInput) $qtyInput.disabled = isOutOfStock;
    }
  };

  if ($incBtn) {
    $incBtn.addEventListener('click', () => {
      const nextQty = currentCartQty + 1;
      if ($qtyInput) $qtyInput.value = nextQty;
      updateQuantity(nextQty);
    });
  }

  if ($decBtn) {
    $decBtn.addEventListener('click', () => {
      const nextQty = currentCartQty - 1;
      if (nextQty <= 0) {
        updateQuantity(0);
      } else {
        if ($qtyInput) $qtyInput.value = nextQty;
        updateQuantity(nextQty);
      }
    });
  }

  let qtyDebounceTimer = null;
  if ($qtyInput) {
    $qtyInput.addEventListener('change', () => {
      const val = parseInt($qtyInput.value, 10);
      const nextQty = Number.isNaN(val) || val < 0 ? 0 : val;
      updateQuantity(nextQty);
    });

    $qtyInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        $qtyInput.blur();
        return;
      }
      clearTimeout(qtyDebounceTimer);
      qtyDebounceTimer = setTimeout(() => {
        const val = parseInt($qtyInput.value, 10);
        if (!Number.isNaN(val)) {
          updateQuantity(val < 0 ? 0 : val);
        }
      }, 600);
    });
  }

  // Lifecycle Events
  events.on('pdp/data', (data) => {
    isOutOfStock = data?.inStock === false;
    if ($atcButton) $atcButton.disabled = isOutOfStock;
    if ($decBtn) $decBtn.disabled = isOutOfStock;
    if ($incBtn) $incBtn.disabled = isOutOfStock;
    if ($qtyInput) $qtyInput.disabled = isOutOfStock;
    updateAccordionVisibility(data);
  }, { eager: true });

  events.on('pdp/valid', (valid) => {
    if ($atcButton) $atcButton.disabled = isOutOfStock || !valid;
  }, { eager: true });

  // Handle option changes
  events.on('pdp/values', () => {
    const configValues = pdpApi.getProductConfigurationValues();

    // Check URL parameter for empty optionsUIDs
    const urlOptionsUIDs = urlParams.get('optionsUIDs');

    // If URL has empty optionsUIDs parameter, treat as base product (no options)
    const optionUIDs = urlOptionsUIDs === '' ? undefined : (configValues?.optionsUIDs || undefined);

    const updateWishlistProps = (btn) => {
      if (btn) {
        btn.setProps((prev) => ({
          ...prev,
          product: {
            ...product,
            optionUIDs,
          },
        }));
      }
    };
    updateWishlistProps(wishlistDesktop);
    updateWishlistProps(wishlistMobile);
    updateWishlistProps(wishlistAddWrap);

    if (lastCartData) {
      syncWithCart(lastCartData);
    }
  }, { eager: true });

  events.on('wishlist/alert', ({ action, item }) => {
    wishlistRender.render(WishlistAlert, {
      action,
      item,
      routeToWishlist,
    })($alert);

    setTimeout(() => {
      $alert.innerHTML = '';
    }, 5000);

    setTimeout(() => {
      $alert.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 0);
  });

  // --- Cart synchronization ---
  events.on(
    'cart/data',
    (cartData) => {
      syncWithCart(cartData);
    },
    { eager: true },
  );

  import('@dropins/storefront-cart/api.js')
    .then((cartApi) => {
      const cachedCart = cartApi.getCartDataFromCache();
      if (cachedCart) {
        syncWithCart(cachedCart);
      }
    })
    .catch((err) => console.debug('Failed to get cached cart:', err));

  // Set JSON-LD and Meta Tags
  events.on('aem/lcp', () => {
    const isPrerendered = isProductPrerendered();
    if (product && !isPrerendered) {
      setJsonLdProduct(product);
      setMetaTags(product);
      document.title = product.name;
    }
  }, { eager: true });

  return Promise.resolve();
}

async function setJsonLdProduct(product) {
  const {
    name,
    inStock,
    description,
    sku,
    urlKey,
    price,
    priceRange,
    images,
    attributes,
  } = product;
  const amount = priceRange?.minimum?.final?.amount || price?.final?.amount;
  const brand = attributes?.find((attr) => attr.name === 'brand');

  // get variants
  const { data } = await pdpApi.fetchGraphQl(`
    query GET_PRODUCT_VARIANTS($sku: String!) {
      variants(sku: $sku) {
        variants {
          product {
            sku
            name
            inStock
            images(roles: ["image"]) {
              url
            }
            ...on SimpleProductView {
              price {
                final { amount { currency value } }
              }
            }
          }
        }
      }
    }
  `, {
    method: 'GET',
    variables: { sku },
  });

  const variants = data?.variants?.variants || [];

  const ldJson = {
    '@context': 'http://schema.org',
    '@type': 'Product',
    name,
    description,
    image: images[0]?.url,
    offers: [],
    productID: sku,
    brand: {
      '@type': 'Brand',
      name: brand?.value,
    },
    url: new URL(getProductLink(urlKey, sku), window.location),
    sku,
    '@id': new URL(getProductLink(urlKey, sku), window.location),
  };

  if (variants.length > 1) {
    ldJson.offers.push(...variants
      // A variant can come back without a resolved product (e.g. an
      // unavailable option combination); skip those so JSON-LD generation
      // doesn't throw on null property access.
      .filter((variant) => variant.product)
      .map((variant) => ({
        '@type': 'Offer',
        name: variant.product.name,
        image: variant.product.images?.[0]?.url,
        price: variant.product.price?.final?.amount?.value,
        priceCurrency: variant.product.price?.final?.amount?.currency,
        availability: variant.product.inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
        sku: variant.product.sku,
      })));
  } else {
    ldJson.offers.push({
      '@type': 'Offer',
      price: amount?.value,
      priceCurrency: amount?.currency,
      availability: inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
    });
  }

  setJsonLd(ldJson, 'product');
}

function createMetaTag(property, content, type) {
  if (!property || !type) {
    return;
  }
  let meta = document.head.querySelector(`meta[${type}="${property}"]`);
  if (meta) {
    if (!content) {
      meta.remove();
      return;
    }
    meta.setAttribute(type, property);
    meta.setAttribute('content', content);
    return;
  }
  if (!content) {
    return;
  }
  meta = document.createElement('meta');
  meta.setAttribute(type, property);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

function setMetaTags(product) {
  if (!product?.sku) {
    return;
  }

  const price = product.prices.final.minimumAmount ?? product.prices.final.amount;

  createMetaTag('title', product.metaTitle || product.name, 'name');
  createMetaTag('description', product.metaDescription, 'name');
  createMetaTag('keywords', product.metaKeyword, 'name');

  createMetaTag('og:type', 'product', 'property');
  createMetaTag('og:description', product.shortDescription, 'property');
  createMetaTag('og:title', product.metaTitle || product.name, 'property');
  createMetaTag('og:url', window.location.href, 'property');
  const mainImage = product?.images?.filter((image) => image.roles.includes('thumbnail'))[0];
  const metaImage = mainImage?.url || product?.images[0]?.url;
  createMetaTag('og:image', metaImage, 'property');
  createMetaTag('og:image:secure_url', metaImage, 'property');
  createMetaTag('product:price:amount', price.value, 'property');
  createMetaTag('product:price:currency', price.currency, 'property');
}

/**
 * Returns the configuration for an image slot.
 * @param ctx - The context of the slot.
 * @returns The configuration for the image slot.
 */
function imageSlotConfig(ctx) {
  const { data, defaultImageProps } = ctx;
  return {
    alias: data.sku,
    imageProps: {
      ...defaultImageProps,
      params: {
        ...defaultImageProps?.params,
        width: defaultImageProps?.width,
        height: defaultImageProps?.height,
      },
    },

    params: {
      width: defaultImageProps.width,
      height: defaultImageProps.height,
    },
  };
}
