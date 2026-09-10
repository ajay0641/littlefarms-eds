import Splide from '../../scripts/vendor/splide/splide.esm.js';
import { loadCSS, readBlockConfig } from '../../scripts/aem.js';
import { getProductSlider } from '@ajay0641/tfs-product-slider/api.js';
import { events } from '@dropins/tools/event-bus.js';
import {
  checkIsAuthenticated,
  CORE_FETCH_GRAPHQL,
  getProductLink,
  rootLink,
} from '../../scripts/commerce.js';
import { getUserTokenCookie } from '../../scripts/initializers/index.js';
import {
  showCartErrorToast,
  showCartSuccessToast,
  showWishlistErrorToast,
  showWishlistLoginToast,
  showWishlistSuccessToast,
} from '../../scripts/components/tfs-wishlist-toast/tfs-wishlist-toast.js';
import { showWishlistAuthModal } from '../../scripts/wishlist-auth-modal.js';

import '../../scripts/initializers/product-slider.js';

loadCSS('/scripts/vendor/splide/splide-core.min.css');

/**
 * Helper to parse comma-separated or array values into a clean string array.
 * @param {unknown} val
 * @returns {string[]}
 */
function parseInValues(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .flatMap((v) => (typeof v === 'string' ? v.split(',') : [String(v)]))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof val === 'string') {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(val).trim()].filter(Boolean);
}

/**
 * Builds Catalog Service filter clauses from optional authored values.
 * Supports:
 * - attribute: "isNew", eq: "1" (default)
 * - attribute: "categoryIds", eq: "6"
 * - attribute: "sku", in: ["NICOKCONFIG", "PURECOMCONFIG"]
 * @param {Record<string, string|string[]>} config
 * @returns {{ attribute: string, eq?: string, in?: string[] }[]|undefined}
 */
function buildFilters(config) {
  const rawAttribute = (
    config.attribute
    || config['filter-attribute']
    || config.filterattribute
    || ''
  ).trim();

  const inValues = parseInValues(
    config.in
    || config['filter-in']
    || config.filterin
    || (rawAttribute === 'sku' ? (config.skus || config.sku) : undefined),
  );

  const rawEq = config.eq ?? config['filter-eq'] ?? config.filtereq;
  const eq = rawEq !== undefined && rawEq !== null ? String(rawEq).trim() : '';

  if (inValues.length > 0) {
    return [{
      attribute: rawAttribute || 'sku',
      in: inValues,
    }];
  }

  if (eq) {
    return [{
      attribute: rawAttribute || 'isNew',
      eq,
    }];
  }

  const attribute = rawAttribute || 'isNew';
  return [{ attribute, eq: '1' }];
}

/**
 * @param {{ isPriceRange?: boolean, addToCartAllowed?: boolean }} product
 * @returns {boolean}
 */
function requiresPdpConfiguration(product) {
  return product.isPriceRange === true || product.addToCartAllowed === false;
}

/**
 * Formats a currency amount.
 * @param {number|undefined} amount
 * @param {string} currency
 * @returns {string}
 */
function formatPrice(amount, currency = 'USD') {
  if (typeof amount !== 'number') return '';
  try {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * @param {HTMLElement|null} button
 * @param {boolean} loading
 */
function setActionLoading(button, loading) {
  if (!button) return;
  button.classList.toggle('is-loading', loading);
  button.toggleAttribute('aria-busy', loading);
  if (loading) {
    button.setAttribute('disabled', '');
  } else {
    button.removeAttribute('disabled');
  }
}

/**
 * @param {typeof import('@dropins/storefront-cart/api.js')} cartApi
 */
function syncCartAuthHeaders(cartApi) {
  const token = getUserTokenCookie();
  if (token) {
    cartApi.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);
  } else {
    cartApi.removeFetchGraphQlHeader('Authorization');
  }
}

/**
 * Waits for cart drop-in init so add-to-cart uses the correct cart (guest or customer).
 * @param {typeof import('@dropins/storefront-cart/api.js')} cartApi
 */
async function ensureCartReady(cartApi) {
  if (cartApi.getCartDataFromCache()) return;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    events.on('cart/initialized', finish, { eager: true });
    window.setTimeout(finish, 5000);
  });
}

/**
 * @param {import('@dropins/storefront-cart/data/models').CartModel|null|undefined} cart
 * @param {string} sku
 * @param {number} previousQuantity
 * @returns {boolean}
 */
function wasProductAddedToCart(cart, sku, previousQuantity) {
  if (!cart) return false;

  const normalizedSku = sku.toUpperCase();
  const itemAdded = (cart.items || []).some((item) => {
    const itemSku = (item.product?.sku || item.sku || '').toUpperCase();
    const topSku = (item.product?.topLevelSku || item.topLevelSku || '').toUpperCase();
    return itemSku === normalizedSku || topSku === normalizedSku;
  });

  return itemAdded || (cart.totalQuantity ?? 0) > previousQuantity;
}

/**
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} wishlistApi
 */
function syncWishlistAuthHeaders(wishlistApi) {
  const token = getUserTokenCookie();
  if (token) {
    wishlistApi.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);
  } else {
    wishlistApi.removeFetchGraphQlHeader('Authorization');
  }
}

/**
 * @param {HTMLElement} button
 * @param {string} sku
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} wishlistApi
 */
function updateWishlistButtonState(button, sku, wishlistApi) {
  if (!checkIsAuthenticated()) {
    button.classList.remove('is-active');
    button.setAttribute('aria-pressed', 'false');
    return;
  }

  const inWishlist = !!wishlistApi.findInPersistedAllWishlistItems(sku);
  button.classList.toggle('is-active', inWishlist);
  button.setAttribute('aria-pressed', inWishlist ? 'true' : 'false');
}

/**
 * @param {Element} block
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} wishlistApi
 */
function resyncWishlistButtons(block, wishlistApi) {
  block.querySelectorAll('.action.towishlist, .towishlist').forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    const { sku } = button.dataset;
    if (sku) updateWishlistButtonState(button, sku, wishlistApi);
  });
}

/**
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} wishlistApi
 * @returns {boolean}
 */
function canUseWishlistApi(wishlistApi) {
  const cfg = wishlistApi.getConfig?.() || wishlistApi.config;
  return cfg?.wishlistIsEnabled !== false;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getWishlistErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return 'We could not update your wishlist. Please try again.';
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getCartErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return 'We could not add this item to your cart. Please try again.';
}

/**
 * Builds a Little Farms styled product card slide for Splide.
 * @param {any} product
 * @param {typeof import('@dropins/storefront-cart/api.js')} cartApi
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} wishlistApi
 * @returns {HTMLElement}
 */
function buildProductSlide(product, cartApi, wishlistApi) {
  const slide = document.createElement('li');
  slide.className = 'splide__slide tfs-product-slider__slide';

  const productUrl = getProductLink(product.urlKey, product.sku);
  const card = document.createElement('div');
  card.className = 'product-item';

  const itemInfo = document.createElement('div');
  itemInfo.className = 'product-item-info';

  // --- Photo + Badge Link ---
  const photoLink = document.createElement('a');
  photoLink.className = 'product photo product-item-photo';
  photoLink.href = productUrl;
  photoLink.setAttribute('aria-label', product.name);

  const img = document.createElement('img');
  img.className = 'product-image-photo';
  img.src = product.imageUrl || '';
  img.alt = product.imageLabel || product.name;
  img.loading = 'lazy';
  img.width = 255;
  img.height = 255;
  photoLink.append(img);

  // Optional Badge (e.g. freshness / farm-to-store)
  if (product.savePercent && product.savePercent > 0) {
    const badge = document.createElement('div');
    badge.className = 'product-item-label product-item-label--save';
    badge.textContent = `Save ${product.savePercent}%`;
    photoLink.append(badge);
  }

  itemInfo.append(photoLink);

  // --- Details Wrapper ---
  const details = document.createElement('div');
  details.className = 'product-item-details';

  // Brand row with wishlist heart
  const metaRow = document.createElement('div');
  metaRow.className = 'product-item-meta';

  if (product.subtitle) {
    const brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = product.subtitle;
    metaRow.append(brand);
  }

  const wishlistBtn = document.createElement('button');
  wishlistBtn.type = 'button';
  wishlistBtn.className = 'action towishlist';
  wishlistBtn.dataset.sku = product.sku;
  wishlistBtn.setAttribute('aria-label', 'Add to Shopping List');

  wishlistBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!checkIsAuthenticated()) {
      showWishlistLoginToast(() => {
        showWishlistAuthModal();
      });
      return;
    }

    if (requiresPdpConfiguration(product)) {
      window.location.href = productUrl;
      return;
    }

    if (!canUseWishlistApi(wishlistApi)) {
      showWishlistErrorToast('Wishlist is not available for this store.');
      return;
    }

    syncWishlistAuthHeaders(wishlistApi);
    const existing = wishlistApi.findInPersistedAllWishlistItems(product.sku);
    const isRemove = !!existing;

    setActionLoading(wishlistBtn, true);
    try {
      if (isRemove) {
        await wishlistApi.removeProductsFromWishlist([existing]);
      } else {
        await wishlistApi.addProductsToWishlist([{ sku: product.sku, quantity: 1 }]);
      }
      updateWishlistButtonState(wishlistBtn, product.sku, wishlistApi);
      await showWishlistSuccessToast(isRemove ? 'remove' : 'add', product.name);
    } catch (err) {
      await showWishlistErrorToast(getWishlistErrorMessage(err));
      console.error('TFS Product Slider: wishlist toggle failed', err);
    } finally {
      setActionLoading(wishlistBtn, false);
    }
  });

  metaRow.append(wishlistBtn);
  details.append(metaRow);

  // Title Link
  const titleWrap = document.createElement('strong');
  titleWrap.className = 'product name product-item-name';
  const titleLink = document.createElement('a');
  titleLink.className = 'product-item-link';
  titleLink.href = productUrl;
  titleLink.title = product.name;
  titleLink.textContent = product.name;
  titleWrap.append(titleLink);
  details.append(titleWrap);

  // Package / weight value if present
  if (product.package) {
    const packageEl = document.createElement('div');
    packageEl.className = 'package';
    packageEl.textContent = product.package;
    details.append(packageEl);
  }

  // Price and Add to Cart row
  const innerRow = document.createElement('div');
  innerRow.className = 'product-item-inner';

  const priceBox = document.createElement('div');
  priceBox.className = 'price-box price-final_price';

  if (product.regularPrice && product.finalPrice && product.regularPrice > product.finalPrice) {
    const oldPrice = document.createElement('span');
    oldPrice.className = 'old-price';
    const oldVal = document.createElement('span');
    oldVal.className = 'price';
    oldVal.textContent = formatPrice(product.regularPrice, product.currency);
    oldPrice.append(oldVal);
    priceBox.append(oldPrice);
  }

  const finalPrice = document.createElement('span');
  finalPrice.className = 'price-wrapper final-price';
  const priceVal = document.createElement('span');
  priceVal.className = 'price';
  priceVal.textContent = formatPrice(product.finalPrice, product.currency);
  finalPrice.append(priceVal);
  priceBox.append(finalPrice);
  innerRow.append(priceBox);

  // Add to Cart Button
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'actions-primary';

  const atcBtn = document.createElement('button');
  atcBtn.type = 'button';
  atcBtn.className = 'action tocart primary';
  atcBtn.title = 'Add to Cart';
  atcBtn.innerHTML = '<span>Add to Cart</span>';

  atcBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (requiresPdpConfiguration(product)) {
      window.location.href = productUrl;
      return;
    }

    if (product.inStock === false) {
      showCartErrorToast('This product is currently out of stock.');
      return;
    }

    setActionLoading(atcBtn, true);
    try {
      syncCartAuthHeaders(cartApi);
      await ensureCartReady(cartApi);

      const previousQuantity = cartApi.getCartDataFromCache()?.totalQuantity ?? 0;
      const cart = await cartApi.addProductsToCart([{ sku: product.sku, quantity: 1 }]);

      if (!wasProductAddedToCart(cart, product.sku, previousQuantity)) {
        throw new Error('Product was not added to your cart. Please try again.');
      }

      try {
        await cartApi.getCartData();
      } catch {
        // Cart refresh is best-effort
      }

      await showCartSuccessToast(product.name, () => {
        window.location.href = rootLink('/cart');
      });
    } catch (err) {
      await showCartErrorToast(getCartErrorMessage(err));
      console.error('TFS Product Slider: add to cart failed', err);
    } finally {
      setActionLoading(atcBtn, false);
    }
  });

  actionsWrap.append(atcBtn);
  innerRow.append(actionsWrap);
  details.append(innerRow);

  itemInfo.append(details);
  card.append(itemInfo);
  slide.append(card);

  return slide;
}

/**
 * loads and decorates the tfs-product-slider block using Splide
 * @param {Element} block
 */
export default async function decorate(block) {
  await Promise.all([
    import('../../scripts/initializers/cart.js'),
    import('../../scripts/initializers/wishlist.js'),
  ]);

  const [cartApi, wishlistApi] = await Promise.all([
    import('@dropins/storefront-cart/api.js'),
    import('@dropins/storefront-wishlist/api.js'),
  ]);

  cartApi.setEndpoint(CORE_FETCH_GRAPHQL);
  syncCartAuthHeaders(cartApi);
  await ensureCartReady(cartApi);

  wishlistApi.setEndpoint(CORE_FETCH_GRAPHQL);
  syncWishlistAuthHeaders(wishlistApi);

  events.on('authenticated', (isAuthenticated) => {
    syncCartAuthHeaders(cartApi);
    syncWishlistAuthHeaders(wishlistApi);
    if (isAuthenticated) {
      ensureCartReady(cartApi).catch(console.error);
    }
    resyncWishlistButtons(block, wishlistApi);
  });

  events.on('wishlist/data', () => {
    resyncWishlistButtons(block, wishlistApi);
  });

  const config = readBlockConfig(block);
  const title = config.title || config.heading || '';
  const phrase = config.phrase || '';
  const pageSize = Number.parseInt(config['page-size'] || config.pagesize || '8', 10) || 8;
  const currentPage = Number.parseInt(config['current-page'] || config.currentpage || '1', 10) || 1;
  const filter = buildFilters(config);

  const subtitle = config.subtitle || '';
  const showAllText = config['show-all-text'] || config.showalltext || '';
  const showAllLink = config['show-all-link'] || config.showalllink || '';
  const sideTitle = !!(subtitle || showAllText || showAllLink);

  block.replaceChildren();

  // Outer container
  const container = document.createElement('div');
  container.className = `tfs-product-slider__container ${sideTitle ? 'tfs-product-slider--side-title' : ''}`;

  // Left panel (desktop) or Header (tablet/mobile) - only render if authored
  if (title || subtitle || (showAllText && showAllLink)) {
    const panel = document.createElement('div');
    panel.className = 'tfs-product-slider__panel block-heading';

    if (title) {
      const titleBox = document.createElement('div');
      titleBox.className = 'block-title';
      const h = document.createElement('h2');
      h.className = 'tfs-product-slider__panel-title';
      h.textContent = title;
      titleBox.append(h);
      panel.append(titleBox);
    }

    if (subtitle) {
      const p = document.createElement('div');
      p.className = 'tfs-product-slider__panel-subtitle block-description';
      p.textContent = subtitle;
      panel.append(p);
    }

    if (showAllText && showAllLink) {
      const shopAll = document.createElement('div');
      shopAll.className = 'tfs-product-slider__shopall category-icons-shopall';
      const a = document.createElement('a');
      a.className = 'tfs-product-slider__panel-link show-all';
      a.href = showAllLink;
      a.textContent = showAllText;
      shopAll.append(a);
      panel.append(shopAll);
    }

    container.append(panel);
  }

  // Slider Wrapper with white organic blob shape
  const sliderMount = document.createElement('div');
  sliderMount.className = 'tfs-product-slider__slider slider-wrap';

  // Splide structure
  const splideEl = document.createElement('div');
  splideEl.className = 'splide tfs-product-slider__splide';
  splideEl.setAttribute('aria-label', title || 'Product Slider');

  const track = document.createElement('div');
  track.className = 'splide__track';

  const list = document.createElement('ul');
  list.className = 'splide__list';

  track.append(list);

  // Custom Arrows
  const arrows = document.createElement('div');
  arrows.className = 'splide__arrows tfs-product-slider__arrows';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'splide__arrow splide__arrow--prev tfs-product-slider__arrow tfs-product-slider__arrow--prev';
  prevBtn.setAttribute('aria-label', 'Previous');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'splide__arrow splide__arrow--next tfs-product-slider__arrow tfs-product-slider__arrow--next';
  nextBtn.setAttribute('aria-label', 'Next');

  arrows.append(prevBtn, nextBtn);
  splideEl.append(track, arrows);
  sliderMount.append(splideEl);
  container.append(sliderMount);
  block.append(container);

  try {
    const result = await getProductSlider({
      phrase,
      pageSize,
      currentPage,
      filter,
    });

    const items = result.items || [];
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tfs-product-slider__empty';
      empty.textContent = 'No products found.';
      sliderMount.replaceChildren(empty);
      return;
    }

    items.forEach((product) => {
      const slide = buildProductSlide(product, cartApi, wishlistApi);
      list.append(slide);
    });

    // Mount Splide with pagination enabled (styled like ideas-to-inspire on mobile)
    const splide = new Splide(splideEl, {
      type: 'slide',
      rewind: false,
      perPage: 4,
      perMove: 1,
      gap: '25px',
      padding: { right: '60px' },
      pagination: true,
      arrows: true,
      drag: true,
      speed: 400,
      breakpoints: {
        1200: {
          perPage: 3,
        },
        1024: {
          perPage: 2,
          arrows: true,
        },
        768: {
          perPage: 3,
          perMove: 2,
          padding: { right: '0' },
          gap: '10px',
          arrows: false,
          pagination: true,
        },
      },
    });

    splide.mount();
    resyncWishlistButtons(block, wishlistApi);
  } catch (err) {
    console.error('TFS Product Slider: Failed to load products', err);
    const errorMsg = document.createElement('p');
    errorMsg.className = 'tfs-product-slider__error';
    errorMsg.textContent = 'Unable to load products.';
    sliderMount.replaceChildren(errorMsg);
  }
}
