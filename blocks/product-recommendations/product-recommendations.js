import { events } from '@dropins/tools/event-bus.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import * as cartApi from '@dropins/storefront-cart/api.js';
import * as wishlistApi from '@dropins/storefront-wishlist/api.js';
import {
  getRecommendationsByUnitIds,
  publishRecsItemAddToCartClick,
  p as publishRecsUnitRender,
  a as publishRecsUnitView,
  b as publishRecsItemClick,
} from '@dropins/storefront-recommendations/api.js';
import { loadCSS, readBlockConfig } from '../../scripts/aem.js';
import { Splide } from '../../scripts/vendor/splide/splide.esm.js';
import {
  checkIsAuthenticated,
  CS_FETCH_GRAPHQL,
  fetchPlaceholders,
  getProductLink,
  getProductSku,
  getStoreIdentifier,
} from '../../scripts/commerce.js';
import { getUserTokenCookie } from '../../scripts/initializers/index.js';
import '../../scripts/initializers/recommendations.js';
import {
  showCartErrorToast,
  showWishlistErrorToast,
  showWishlistSuccessToast,
} from '../../scripts/components/tfs-wishlist-toast/tfs-wishlist-toast.js';
import { showShoppingListAlert } from '../../scripts/components/shopping-list-alert/shopping-list-alert.js';
import { createAddToCartButton } from '../product-list-page/plp-product-card.js';

loadCSS('/scripts/vendor/splide/splide-core.min.css');

// Guests get the shopping-list prompt instead of wishlist actions, so hold off on the
// wishlist drop-in (and its STORE_CONFIG_QUERY) until a customer is signed in.
const loadWishlistDropin = () => import('../../scripts/initializers/wishlist.js');
if (checkIsAuthenticated()) loadWishlistDropin();
events.on('authenticated', (authenticated) => {
  if (authenticated) loadWishlistDropin();
});

/**
 * Validates and returns a product view history entry if valid
 * @param {Object} entry - The history entry to validate
 * @returns {Object|null} - Validated history entry or null if invalid
 */
function getValidViewEntry(entry) {
  if (entry && typeof entry === 'object' && entry.sku && entry.date) {
    return {
      sku: entry.sku,
      date: entry.date,
    };
  }
  return null;
}

/**
 * Gets product view history from localStorage
 * @returns {Array} - Array of view history items
 */
export function getProductViewHistory() {
  const storeIdentifier = getStoreIdentifier();
  try {
    if (!storeIdentifier) {
      return [];
    }
    const viewHistory = window.localStorage.getItem(`${storeIdentifier}:productViewHistory`) || '[]';
    const parsedHistory = JSON.parse(viewHistory);
    if (!Array.isArray(parsedHistory)) {
      throw new Error('Product view history is not an array');
    }
    const validHistory = parsedHistory.map(getValidViewEntry).filter((entry) => entry !== null);
    if (validHistory.length === 0) {
      window.localStorage.removeItem(`${storeIdentifier}:productViewHistory`);
    }
    return validHistory;
  } catch (e) {
    window.localStorage.removeItem(`${storeIdentifier}:productViewHistory`);
    console.error('Error parsing product view history', e);
    return [];
  }
}

/**
 * Validates and returns a purchase history entry if valid
 * @param {Object} entry - The history entry to validate
 * @returns {Object|null} - Validated history entry or null if invalid
 */
function getValidPurchaseEntry(entry) {
  const { items, date } = entry ?? {};
  if (Array.isArray(items) && items.every((item) => typeof item === 'string') && date) {
    return { items, date };
  }
  return null;
}

/**
 * Gets purchase history from localStorage
 * @returns {Array} - Array of purchase history items
 */
export function getPurchaseHistory() {
  const storeIdentifier = getStoreIdentifier();
  try {
    if (!storeIdentifier) {
      return [];
    }
    const purchaseHistory = window.localStorage.getItem(`${storeIdentifier}:purchaseHistory`) || '[]';
    const parsedHistory = JSON.parse(purchaseHistory);
    if (!Array.isArray(parsedHistory)) {
      throw new Error('Purchase history is not an array');
    }
    const validHistory = parsedHistory.map(getValidPurchaseEntry).filter((entry) => entry !== null);
    if (validHistory.length === 0) {
      window.localStorage.removeItem(`${storeIdentifier}:purchaseHistory`);
    }
    return validHistory;
  } catch (e) {
    window.localStorage.removeItem(`${storeIdentifier}:purchaseHistory`);
    console.error('Error parsing purchase history', e);
    return [];
  }
}

/**
 * @param {{ isPriceRange?: boolean, addToCartAllowed?: boolean }} product
 * @returns {boolean}
 */
function requiresPdpConfiguration(product) {
  return product.itemType === 'ComplexProductView'
    || product.typename === 'ComplexProductView'
    || product.__typename === 'ComplexProductView'
    || product.addToCartAllowed === false;
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
 * @param {typeof import('@dropins/storefront-cart/api.js')} cart
 */
function syncCartAuthHeaders(cart) {
  if (!cart?.setFetchGraphQlHeader) return;
  const token = getUserTokenCookie();
  if (token) {
    cart.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);
  } else {
    cart.removeFetchGraphQlHeader('Authorization');
  }
}

/**
 * @param {typeof import('@dropins/storefront-cart/api.js')} cart
 */
async function ensureCartReady(cart) {
  if (!cart || cart.getCartDataFromCache()) return;

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
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} api
 */
function syncWishlistAuthHeaders(api) {
  if (!api?.setFetchGraphQlHeader) return;
  const token = getUserTokenCookie();
  if (token) {
    api.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);
  } else {
    api.removeFetchGraphQlHeader('Authorization');
  }
}

/**
 * @param {HTMLElement} button
 * @param {string} sku
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} api
 */
function updateWishlistButtonState(button, sku, api) {
  if (!checkIsAuthenticated()) {
    button.classList.remove('is-active');
    button.setAttribute('aria-pressed', 'false');
    return;
  }

  const inWishlist = !api.findInPersistedAllWishlistItems(sku);
  button.classList.toggle('is-active', inWishlist);
  button.setAttribute('aria-pressed', inWishlist ? 'true' : 'false');
}

/**
 * @param {Element} block
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} api
 */
function resyncWishlistButtons(block, api) {
  block.querySelectorAll('.action.towishlist, .towishlist').forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    const { sku } = button.dataset;
    if (sku) updateWishlistButtonState(button, sku, api);
  });
}

/**
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} api
 * @returns {boolean}
 */
function canUseWishlistApi(api) {
  const cfg = api.getConfig?.() || api.config;
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

function resolveImageUrl(url = '') {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function findAttribute(attributes, names) {
  if (!attributes || !attributes.length) return undefined;
  const lowerNames = names.map((n) => n.toLowerCase());
  const match = attributes.find((a) => a?.name && lowerNames.includes(a.name.toLowerCase()));
  return match?.value;
}

async function fetchProductsAttributes(skus = []) {
  if (!skus.length) return new Map();
  const query = `
    query GetProductsAttributes($skus: [String!]!) {
      products(skus: $skus) {
        sku
        attributes {
          name
          label
          value
        }
      }
    }
  `;
  try {
    const response = await CS_FETCH_GRAPHQL.fetchGraphQl(query, {
      method: 'POST',
      variables: { skus },
    });
    const map = new Map();
    (response?.data?.products || []).forEach((p) => {
      if (p?.sku) map.set(p.sku, p.attributes || []);
    });
    return map;
  } catch {
    return new Map();
  }
}

function normalizeRecommendationItem(item) {
  const imageUrl = item.images?.[0]?.url || '';
  const priceObj = item.price?.final?.amount || item.priceRange?.minimum?.final?.amount || {};
  const regPriceObj = item.price?.regular?.amount || item.priceRange?.minimum?.regular?.amount;
  const finalPrice = priceObj.value;
  const regularPrice = regPriceObj?.value ?? finalPrice;
  const currency = priceObj.currency || 'USD';

  let savePercent = 0;
  if (typeof regularPrice === 'number' && typeof finalPrice === 'number'
    && regularPrice > finalPrice && regularPrice > 0) {
    savePercent = Math.round(((regularPrice - finalPrice) / regularPrice) * 100);
  }

  const rawProductLabel = item.product_label
    || (item.attributes && findAttribute(item.attributes, ['product_label']));
  let productLabels = [];
  if (Array.isArray(rawProductLabel)) {
    productLabels = rawProductLabel
      .flatMap((val) => (typeof val === 'string' ? val.split(',') : [String(val)]))
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (typeof rawProductLabel === 'string') {
    productLabels = rawProductLabel
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return {
    sku: item.sku,
    name: item.name || 'Product',
    subtitle: '',
    brand: '',
    package: '',
    productLabels,
    urlKey: item.urlKey || item.sku,
    imageUrl: resolveImageUrl(imageUrl),
    imageLabel: item.images?.[0]?.label || item.name || 'Product',
    finalPrice,
    regularPrice,
    currency,
    isPriceRange: item.itemType === 'ComplexProductView',
    savePercent,
    inStock: item.inStock !== false,
    addToCartAllowed: item.addToCartAllowed !== false,
  };
}

/**
 * Builds a Little Farms styled product card slide for Splide matching styles.css.
 * @param {any} product
 * @param {typeof import('@dropins/storefront-cart/api.js')} cart
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} api
 * @param {any} recommendationUnit
 * @param {number} itemIndex
 * @returns {HTMLElement}
 */
function buildProductSlide(product, cart, api, recommendationUnit, itemIndex) {
  const slide = document.createElement('li');
  slide.className = 'splide__slide product-recommendations__slide tfs-product-slider__slide';

  const productUrl = getProductLink(product.urlKey, product.sku);
  const card = document.createElement('div');
  card.className = 'product-item';

  const itemInfo = document.createElement('div');
  itemInfo.className = 'product-item-info';

  const handleItemClick = () => {
    if (recommendationUnit) {
      publishRecsItemClick({
        recommendationUnit,
        pagePlacement: 'product-list',
        yOffsetTop: card.getBoundingClientRect().top ?? 0,
        yOffsetBottom: card.getBoundingClientRect().bottom ?? 0,
        productId: itemIndex,
      });
    }
  };

  // --- Photo + Badge Link ---
  const photoLink = document.createElement('a');
  photoLink.className = 'product photo product-item-photo';
  photoLink.href = productUrl;
  photoLink.setAttribute('aria-label', product.name);
  photoLink.addEventListener('click', handleItemClick);

  const img = document.createElement('img');
  img.className = 'product-image-photo';
  img.src = product.imageUrl || '/styles/images/placeholder.jpg';
  img.alt = product.imageLabel || product.name;
  img.loading = 'lazy';
  img.width = 255;
  img.height = 255;
  photoLink.append(img);

  // Badges (product_label / Save %)
  const hasLabels = Array.isArray(product.productLabels) && product.productLabels.length > 0;
  const hasSave = product.savePercent && product.savePercent > 0;

  if (hasLabels || hasSave) {
    const labelsWrap = document.createElement('div');
    labelsWrap.className = 'product-item-labels';

    if (hasLabels) {
      product.productLabels.forEach((lbl) => {
        const badge = document.createElement('div');
        badge.className = 'product-item-label';
        badge.textContent = lbl;
        labelsWrap.append(badge);
      });
    }

    if (hasSave) {
      const saveBadge = document.createElement('div');
      saveBadge.className = 'product-item-label product-item-label--save';
      saveBadge.textContent = `Save ${product.savePercent}%`;
      labelsWrap.append(saveBadge);
    }

    photoLink.append(labelsWrap);
  }

  itemInfo.append(photoLink);

  // --- Details Wrapper ---
  const details = document.createElement('div');
  details.className = 'product-item-details';

  // Brand row with wishlist heart
  const metaRow = document.createElement('div');
  metaRow.className = 'product-item-meta';

  if (product.subtitle || product.brand) {
    const brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = product.subtitle || product.brand;
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
      showShoppingListAlert();
      return;
    }

    if (requiresPdpConfiguration(product)) {
      window.location.href = productUrl;
      return;
    }

    if (!canUseWishlistApi(api)) {
      showWishlistErrorToast('Wishlist is not available for this store.');
      return;
    }

    syncWishlistAuthHeaders(api);
    const existing = api.findInPersistedAllWishlistItems(product.sku);
    const isRemove = !existing;

    setActionLoading(wishlistBtn, true);
    try {
      if (isRemove) {
        await api.removeProductsFromWishlist([existing]);
      } else {
        await api.addProductsToWishlist([{ sku: product.sku, quantity: 1 }]);
      }
      updateWishlistButtonState(wishlistBtn, product.sku, api);
      await showWishlistSuccessToast(isRemove ? 'remove' : 'add', product.name);
    } catch (err) {
      await showWishlistErrorToast(getWishlistErrorMessage(err));
      console.error('Product Recommendations: wishlist toggle failed', err);
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
  titleLink.addEventListener('click', handleItemClick);
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

  const leftBox = document.createElement('div');
  leftBox.className = 'left';

  const priceBox = document.createElement('div');
  priceBox.className = 'price-box price-final_price';

  const isDiscounted = product.regularPrice && product.finalPrice
    && product.regularPrice > product.finalPrice;
  if (isDiscounted) {
    const oldPrice = document.createElement('span');
    oldPrice.className = 'old-price';
    const oldVal = document.createElement('span');
    oldVal.className = 'price';
    oldVal.textContent = formatPrice(product.regularPrice, product.currency);
    oldPrice.append(oldVal);
    priceBox.append(oldPrice);
  }

  const finalPrice = document.createElement('span');
  finalPrice.className = `price-wrapper final-price${isDiscounted ? ' special-price' : ''}`;
  const priceVal = document.createElement('span');
  priceVal.className = 'price';
  priceVal.textContent = formatPrice(product.finalPrice, product.currency);
  finalPrice.append(priceVal);
  priceBox.append(finalPrice);
  leftBox.append(priceBox);
  innerRow.append(leftBox);

  // Add to Cart Button (from PLP)
  const actionsWrap = createAddToCartButton(product, {
    label: `Add to Cart ${product.name || product.sku}`,
    addLabel: 'Add to Cart',
    addingLabel: 'Adding...',
    addedLabel: 'Added',
    disabled: product.inStock === false && !requiresPdpConfiguration(product),
    onAdd: async () => {
      if (requiresPdpConfiguration(product)) {
        window.location.href = productUrl;
        return null;
      }
      if (product.inStock === false) {
        showCartErrorToast('This product is currently out of stock.');
        return null;
      }
      syncCartAuthHeaders(cart);
      await ensureCartReady(cart);
      const previousQuantity = cart?.getCartDataFromCache()?.totalQuantity ?? 0;
      const cartResult = await cart?.addProductsToCart([{ sku: product.sku, quantity: 1 }]);
      if (!wasProductAddedToCart(cartResult, product.sku, previousQuantity)) {
        throw new Error('Product was not added to your cart. Please try again.');
      }
      if (recommendationUnit) {
        publishRecsItemAddToCartClick({
          recommendationUnit,
          pagePlacement: 'product-list',
          yOffsetTop: card.getBoundingClientRect().top ?? 0,
          yOffsetBottom: card.getBoundingClientRect().bottom ?? 0,
          productId: itemIndex,
        });
      }
      let finalCart = cartResult;
      try {
        const fresh = await cart?.getCartData();
        if (fresh) finalCart = fresh;
      } catch (err) { /* noop */ }
      return finalCart || cart?.getCartDataFromCache() || cartResult;
    },
    onUpdateQty: async (uid, quantity) => {
      syncCartAuthHeaders(cart);
      await ensureCartReady(cart);
      const cartResult = await cart.updateProductsFromCart([{ uid, quantity }]);
      let finalCart = cartResult;
      try {
        const fresh = await cart?.getCartData();
        if (fresh) finalCart = fresh;
      } catch (err) { /* noop */ }
      return finalCart || cart?.getCartDataFromCache() || cartResult;
    },
  });
  actionsWrap.syncFromCart?.(cart?.getCartDataFromCache());
  innerRow.append(actionsWrap);

  details.append(innerRow);
  itemInfo.append(details);
  card.append(itemInfo);
  slide.append(card);

  return slide;
}

/**
 * Standardized Commerce Product Recommendations Block Decorator
 * Designed like Product Relations
 * @param {HTMLElement} block
 */
async function renderRecommendations(block) {
  const config = readBlockConfig(block);
  block.textContent = '';

  // Placeholder is appended before the first await so the block reserves space
  // synchronously and the surrounding section can become visible right away.
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'product-recommendations-loading';
  loadingDiv.textContent = 'Loading...';
  block.appendChild(loadingDiv);

  const labels = await fetchPlaceholders();
  loadingDiv.textContent = labels.Global?.LoadingProducts || 'Loading...';

  const recid = config.recid || config.recId || config.unitid || config.unitId;
  let currentsku = config.currentsku || config.currentSku || config.sku;
  const currentprice = config.currentprice || config.currentPrice;

  // Resolve current SKU
  if (!currentsku) {
    currentsku = getProductSku();
  }
  if (!currentsku) {
    currentsku = document.querySelector('meta[name="product-sku"]')?.content
      || document.querySelector('meta[name="sku"]')?.content;
  }
  if (!currentsku) {
    currentsku = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 800);
      events.on('pdp/data', (data) => {
        clearTimeout(timer);
        resolve(data?.sku || data?.topLevelSku || null);
      }, { eager: true });
    });
  }

  // Resolve cart SKUs
  let cartSkus = [];
  try {
    const cachedCart = cartApi?.getCartDataFromCache();
    if (cachedCart?.items?.length) {
      cartSkus = cachedCart.items.map((i) => i.product?.sku || i.sku).filter(Boolean);
    }
  } catch {
    // Ignore error
  }

  if (!currentsku && cartSkus.length > 0) {
    [currentsku] = cartSkus;
  }

  // Handle ACO pricing
  const isACO = getConfigValue('adobe-commerce-optimizer') === true
    || getConfigValue('adobe-commerce-optimizer') === 'true';
  let resolvedPrice = null;
  if (isACO && currentprice != null) {
    resolvedPrice = Number(currentprice);
  }

  const currentProduct = currentsku
    ? { sku: currentsku, ...(resolvedPrice != null && { price: resolvedPrice }) }
    : undefined;

  let recommendationUnit = null;
  let finalProducts = [];

  // 1. Fetch from recommendations API if recid is provided
  if (recid) {
    try {
      const userPurchaseHistory = getPurchaseHistory();
      const userViewHistory = getProductViewHistory();
      let results = await getRecommendationsByUnitIds({
        unitIds: [recid],
        currentSku: currentsku || '',
        cartSkus: cartSkus.length ? cartSkus : undefined,
        userPurchaseHistory,
        userViewHistory,
        currentProduct,
      });

      // If passing cartSkus filtered out all recommendations (e.g. item in cart),
      // retry without cartSkus so recommendations don't disappear from PDP
      const hasItems = Array.isArray(results) && results.some((u) => u.items?.length > 0);
      if (!hasItems && cartSkus.length > 0) {
        results = await getRecommendationsByUnitIds({
          unitIds: [recid],
          currentSku: currentsku || '',
          userPurchaseHistory,
          userViewHistory,
          currentProduct,
        });
      }

      if (Array.isArray(results) && results.length > 0) {
        recommendationUnit = results.find((u) => u.unitId === recid && u.items?.length > 0)
          || results.find((u) => u.items?.length > 0)
          || results[0];

        finalProducts = (recommendationUnit?.items || []).map(normalizeRecommendationItem);

        if (finalProducts.length > 0) {
          const skus = finalProducts.map((p) => p.sku).filter(Boolean);
          const attrMap = await fetchProductsAttributes(skus);
          finalProducts.forEach((p) => {
            const attrs = attrMap.get(p.sku) || [];
            const rawProductLabel = findAttribute(attrs, ['product_label']);
            if (rawProductLabel) {
              if (Array.isArray(rawProductLabel)) {
                p.productLabels = rawProductLabel
                  .flatMap((val) => (typeof val === 'string' ? val.split(',') : [String(val)]))
                  .map((s) => s.trim())
                  .filter(Boolean);
              } else if (typeof rawProductLabel === 'string') {
                p.productLabels = rawProductLabel
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
              }
            }
            const rawBrand = findAttribute(attrs, ['brand', 'subtitle', 'manufacturer']);
            if (rawBrand && !p.brand) {
              p.brand = rawBrand.replace(/<[^>]*>/g, '').trim();
              p.subtitle = p.brand;
            }
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    }
  }

  loadingDiv.remove();

  if (!finalProducts || finalProducts.length === 0) {
    block.style.display = 'none';
    const wrapper = block.closest('.product-recommendations-wrapper');
    if (wrapper) {
      wrapper.style.display = 'none';
    }
    return;
  }

  // Heading title
  const headingTitle = config.title
    || config.heading
    || recommendationUnit?.title
    || labels.Recommendations?.Title
    || 'Recommended For You';

  // Render product recommendations slider container matching product-relations
  block.replaceChildren();

  const container = document.createElement('div');
  container.className = 'product-recommendations__container tfs-product-slider__container';

  if (headingTitle) {
    const panel = document.createElement('div');
    panel.className = 'product-recommendations__panel tfs-product-slider__panel block-heading';

    const titleBox = document.createElement('div');
    titleBox.className = 'block-title';
    const h = document.createElement('h2');
    h.className = 'product-recommendations__panel-title tfs-product-slider__panel-title';
    h.textContent = headingTitle;
    titleBox.append(h);
    panel.append(titleBox);

    container.append(panel);
  }

  const sliderMount = document.createElement('div');
  sliderMount.className = 'product-recommendations__slider tfs-product-slider__slider slider-wrap';

  const splideEl = document.createElement('div');
  splideEl.className = 'splide product-recommendations__splide tfs-product-slider__splide';
  splideEl.setAttribute('aria-label', headingTitle);

  const track = document.createElement('div');
  track.className = 'splide__track';

  const list = document.createElement('ul');
  list.className = 'splide__list';

  track.append(list);

  const arrows = document.createElement('div');
  arrows.className = 'splide__arrows product-recommendations__arrows tfs-product-slider__arrows';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'splide__arrow splide__arrow--prev product-recommendations__arrow product-recommendations__arrow--prev';
  prevBtn.setAttribute('aria-label', 'Previous');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'splide__arrow splide__arrow--next product-recommendations__arrow product-recommendations__arrow--next';
  nextBtn.setAttribute('aria-label', 'Next');

  arrows.append(prevBtn, nextBtn);
  splideEl.append(track, arrows);
  sliderMount.append(splideEl);
  container.append(sliderMount);
  block.append(container);

  finalProducts.forEach((product, index) => {
    const slide = buildProductSlide(product, cartApi, wishlistApi, recommendationUnit, index);
    list.append(slide);
  });

  const hasMultiple = finalProducts.length > 1;
  container.classList.toggle('is-single-product', !hasMultiple);

  const splide = new Splide(splideEl, {
    type: 'slide',
    rewind: false,
    perPage: 5,
    perMove: 1,
    gap: '25px',
    padding: { right: '100px' },
    pagination: hasMultiple,
    arrows: true,
    drag: true,
    speed: 400,
    breakpoints: {
      1200: {
        perPage: 3,
        perMove: 1,
        padding: { right: '90px' },
      },
      768: {
        perPage: 2,
        perMove: 1,
        padding: { right: '50px' },
        arrows: false,
        pagination: hasMultiple,
      },
      576: {
        perPage: 2,
        perMove: 1,
        padding: { right: '35px' },
        gap: '15px',
        arrows: false,
        pagination: hasMultiple,
      },
    },
  });

  splide.mount();

  // Track Adobe Client Data Layer impression and view events
  if (recommendationUnit) {
    publishRecsUnitRender({
      recommendationUnit,
      pagePlacement: 'product-list',
      yOffsetTop: block.getBoundingClientRect().top ?? 0,
      yOffsetBottom: block.getBoundingClientRect().bottom ?? 0,
      backupProducts: 0,
      searchTime: 0,
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.intersectionRatio > 0.5) {
          publishRecsUnitView({
            recommendationUnit,
            pagePlacement: 'product-list',
            yOffsetTop: block.getBoundingClientRect().top ?? 0,
            yOffsetBottom: block.getBoundingClientRect().bottom ?? 0,
          });
          observer.disconnect();
        }
      });
    }, { threshold: 0.5 });
    observer.observe(block);
  }

  resyncWishlistButtons(block, wishlistApi);

  events.on('wishlist/data', () => {
    resyncWishlistButtons(block, wishlistApi);
  });
  events.on('authenticated', () => {
    resyncWishlistButtons(block, wishlistApi);
  });

  events.on('cart/data', (cart) => {
    block.querySelectorAll('.actions-primary').forEach((el) => {
      if (typeof el.syncFromCart === 'function') {
        el.syncFromCart(cart);
      }
    });
  });
}

/**
 * Loads and decorates the block.
 *
 * aem.js keeps a section hidden until every block in it resolves, and this block shares
 * a section with the product grid. Recommendations sit below the fold and need two extra
 * GraphQL round-trips, so they are rendered without blocking, keeping them off the
 * first-paint path.
 *
 * @param {Element} block The block element
 * @returns {void}
 */
export default function decorate(block) {
  renderRecommendations(block).catch((error) => {
    console.error('Failed to render product recommendations:', error);
    block.textContent = '';
  });
}
