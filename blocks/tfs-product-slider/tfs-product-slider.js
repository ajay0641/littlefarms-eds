import ProductSliderContainer from '@ajay0641/tfs-product-slider/containers/ProductSliderContainer.js';
import { render as provider } from '@ajay0641/tfs-product-slider/render.js';
import { getProductSlider } from '@ajay0641/tfs-product-slider/api.js';
import { events } from '@dropins/tools/event-bus.js';
import { readBlockConfig } from '../../scripts/aem.js';
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

/**
 * Builds Catalog Service filter clauses from optional authored values.
 * @param {Record<string, string>} config
 * @returns {{ attribute: string, eq: string }[]|undefined}
 */
function buildFilters(config) {
  const attribute = (
    config.attribute
    || config['filter-attribute']
    || config.filterattribute
    || 'isNew'
  ).trim();
  const eq = (
    config.eq
    || config['filter-eq']
    || config.filtereq
    || '1'
  ).trim();
  if (!attribute) return undefined;
  return [{ attribute, eq }];
}

/**
 * @param {{ isPriceRange?: boolean, addToCartAllowed?: boolean }} product
 * @returns {boolean}
 */
function requiresPdpConfiguration(product) {
  return product.isPriceRange === true || product.addToCartAllowed === false;
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
 * @param {{ sku: string }[]} items
 */
function syncWishlistButtons(block, wishlistApi, items = []) {
  const slides = block.querySelectorAll('.tfsproductslider-product-slider-component__slide');
  slides.forEach((slide, index) => {
    const sku = items[index]?.sku;
    const button = slide.querySelector('.tfsproductslider-product-card__wishlist');
    if (!(button instanceof HTMLElement) || !sku) return;
    button.dataset.sku = sku;
    updateWishlistButtonState(button, sku, wishlistApi);
  });
}

/**
 * @param {Element} block
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} wishlistApi
 */
function resyncWishlistButtons(block, wishlistApi) {
  block.querySelectorAll('.tfsproductslider-product-card__wishlist').forEach((button) => {
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

  const config = readBlockConfig(block);
  const title = config.title || config.heading || '';
  const phrase = config.phrase || '';
  const pageSize = Number.parseInt(config['page-size'] || config.pagesize || '8', 10) || 8;
  const currentPage = Number.parseInt(config['current-page'] || config.currentpage || '1', 10) || 1;
  const filter = buildFilters(config);

  block.replaceChildren();

  /** @type {HTMLElement|null} */
  let lastAtcButton = null;
  /** @type {HTMLElement|null} */
  let lastWishlistButton = null;

  block.addEventListener('click', (event) => {
    const atcButton = event.target.closest?.('.tfsproductslider-product-card__atc');
    if (atcButton instanceof HTMLElement) {
      lastAtcButton = atcButton;
    }
    const wishlistButton = event.target.closest?.('.tfsproductslider-product-card__wishlist');
    if (wishlistButton instanceof HTMLElement) {
      lastWishlistButton = wishlistButton;
    }
  }, true);

  events.on('wishlist/data', () => {
    resyncWishlistButtons(block, wishlistApi);
  });

  await provider.render(ProductSliderContainer, {
    title: title || undefined,
    phrase,
    pageSize,
    currentPage,
    filter,
    fetchProducts: async () => {
      const result = await getProductSlider({
        phrase,
        pageSize,
        currentPage,
        filter,
      });
      return {
        ...result,
        items: (result.items || []).map((item) => ({
          ...item,
          url: getProductLink(item.urlKey, item.sku),
        })),
      };
    },
    onAddToCart: async (product) => {
      if (!product?.sku) return;

      const button = lastAtcButton;

      if (requiresPdpConfiguration(product)) {
        window.location.href = getProductLink(product.urlKey, product.sku);
        return;
      }

      if (product.inStock === false) {
        showCartErrorToast('This product is currently out of stock.');
        return;
      }

      setActionLoading(button, true);
      try {
        syncCartAuthHeaders(cartApi);
        await ensureCartReady(cartApi);

        const previousQuantity = cartApi.getCartDataFromCache()?.totalQuantity ?? 0;
        const cart = await cartApi.addProductsToCart([
          { sku: product.sku, quantity: 1 },
        ]);

        if (!wasProductAddedToCart(cart, product.sku, previousQuantity)) {
          throw new Error('Product was not added to your cart. Please try again.');
        }

        try {
          await cartApi.getCartData();
        } catch {
          // Cart refresh is best-effort; add mutation already succeeded.
        }

        await showCartSuccessToast(product.name, () => {
          window.location.href = rootLink('/cart');
        });
      } catch (error) {
        await showCartErrorToast(getCartErrorMessage(error));
        console.error('TFS Product Slider: add to cart failed', error);
      } finally {
        setActionLoading(button, false);
        lastAtcButton = null;
      }
    },
    onAddToWishlist: async (product) => {
      if (!product?.sku) return;

      const button = lastWishlistButton;

      if (requiresPdpConfiguration(product)) {
        window.location.href = getProductLink(product.urlKey, product.sku);
        return;
      }

      if (!checkIsAuthenticated()) {
        showWishlistLoginToast(() => {
          showWishlistAuthModal();
        });
        return;
      }

      if (!canUseWishlistApi(wishlistApi)) {
        showWishlistErrorToast('Wishlist is not available for this store.');
        return;
      }

      syncWishlistAuthHeaders(wishlistApi);

      const existing = wishlistApi.findInPersistedAllWishlistItems(product.sku);
      const isRemove = !!existing;

      setActionLoading(button, true);
      try {
        if (isRemove) {
          await wishlistApi.removeProductsFromWishlist([existing]);
        } else {
          await wishlistApi.addProductsToWishlist([{ sku: product.sku, quantity: 1 }]);
        }

        if (button instanceof HTMLElement) {
          button.dataset.sku = product.sku;
          updateWishlistButtonState(button, product.sku, wishlistApi);
        }

        await showWishlistSuccessToast(isRemove ? 'remove' : 'add', product.name);
      } catch (error) {
        await showWishlistErrorToast(getWishlistErrorMessage(error));
        console.error('TFS Product Slider: wishlist toggle failed', error);
      } finally {
        setActionLoading(button, false);
        lastWishlistButton = null;
      }
    },
    onLoad: (result) => {
      syncWishlistButtons(block, wishlistApi, result?.items || []);
    },
  })(block);
}
