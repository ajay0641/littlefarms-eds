import { events } from '@dropins/tools/event-bus.js';
import * as wishlistApi from '@dropins/storefront-wishlist/api.js';
import { loadCSS, readBlockConfig } from '../../scripts/aem.js';
import { Splide } from '../../scripts/vendor/splide/splide.esm.js';
import {
  checkIsAuthenticated,
  CORE_FETCH_GRAPHQL,
  CS_FETCH_GRAPHQL,
  fetchPlaceholders,
  getProductLink,
  getProductSku,
  rootLink,
} from '../../scripts/commerce.js';
import { getUserTokenCookie } from '../../scripts/initializers/index.js';
import '../../scripts/initializers/wishlist.js';
import {
  showCartErrorToast,
  showCartSuccessToast,
  showWishlistErrorToast,
  showWishlistLoginToast,
  showWishlistSuccessToast,
} from '../../scripts/components/tfs-wishlist-toast/tfs-wishlist-toast.js';
import { showWishlistAuthModal } from '../../scripts/wishlist-auth-modal.js';

loadCSS('/scripts/vendor/splide/splide-core.min.css');

/**
 * Standard relationship parameter registry mappings
 */
const RELATION_REGISTRY = {
  related: {
    defaultTitle: 'Related Products',
  },
  upsell: {
    defaultTitle: 'You May Also Like',
  },
  crosssell: {
    defaultTitle: 'Complete Your Order',
  },
};

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
  if (!cartApi?.setFetchGraphQlHeader) return;
  const token = getUserTokenCookie();
  if (token) {
    cartApi.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);
  } else {
    cartApi.removeFetchGraphQlHeader('Authorization');
  }
}

/**
 * @param {typeof import('@dropins/storefront-cart/api.js')} cartApi
 */
async function ensureCartReady(cartApi) {
  if (!cartApi || cartApi.getCartDataFromCache()) return;

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

  const inWishlist = !!api.findInPersistedAllWishlistItems(sku);
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
 * @param {unknown} error
 * @returns {string}
 */
function getCartErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return 'We could not add this item to your cart. Please try again.';
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

function matchesRelationType(linkTypes = [], targetType = 'related') {
  const normalizedTarget = targetType.toLowerCase().replace(/[^a-z]/g, '');
  return linkTypes.some((type) => {
    const norm = String(type).toLowerCase().replace(/[^a-z]/g, '');
    return norm.includes(normalizedTarget) || normalizedTarget.includes(norm);
  });
}

function normalizeProductView(pv) {
  if (!pv || !pv.sku || !pv.name) return null;

  let imageUrl = '';
  let imageLabel = pv.name || 'Product';
  if (pv.small_image?.url) {
    imageUrl = pv.small_image.url;
    imageLabel = pv.small_image.label || imageLabel;
  } else if (Array.isArray(pv.images)) {
    const primaryImg = pv.images.find((img) => img.roles?.includes('image'))
      || pv.images.find((img) => img.roles?.includes('small_image'))
      || pv.images[0];
    imageUrl = primaryImg?.url || '';
    imageLabel = primaryImg?.label || imageLabel;
  }

  const isPriceRange = !!pv.priceRange;
  const priceObj = pv.price || pv.priceRange?.minimum || pv.price_range?.minimum_price || {};
  const finalPrice = priceObj.final?.amount?.value ?? priceObj.final_price?.value;
  const regularPrice = priceObj.regular?.amount?.value ?? priceObj.regular_price?.value;
  const currency = priceObj.final?.amount?.currency
    || priceObj.regular?.amount?.currency
    || priceObj.final_price?.currency
    || priceObj.regular_price?.currency
    || 'USD';

  let savePercent = 0;
  if (typeof regularPrice === 'number' && typeof finalPrice === 'number'
    && regularPrice > finalPrice && regularPrice > 0) {
    savePercent = Math.round(((regularPrice - finalPrice) / regularPrice) * 100);
  }

  const rawSubtitle = findAttribute(
    pv.attributes,
    ['subtitle', 'brand', 'manufacturer', 'short_description'],
  );
  const subtitle = rawSubtitle ? rawSubtitle.replace(/<[^>]*>/g, '').trim() : '';
  const rawPackage = findAttribute(pv.attributes, ['package', 'weight', 'net_weight', 'size']);
  const pkg = rawPackage ? rawPackage.replace(/<[^>]*>/g, '').trim() : '';

  return {
    sku: pv.sku,
    name: pv.name || 'Product',
    subtitle,
    brand: subtitle,
    package: pkg,
    urlKey: pv.urlKey || pv.url_key || pv.sku,
    imageUrl: resolveImageUrl(imageUrl),
    imageLabel,
    finalPrice,
    regularPrice,
    currency,
    isPriceRange,
    savePercent,
    inStock: pv.inStock !== false && pv.stock_status !== 'OUT_OF_STOCK',
    addToCartAllowed: pv.addToCartAllowed !== false,
  };
}

async function fetchProductsBySkus(skus = []) {
  if (!skus.length) return [];

  const query = `
    query GetProductsBySkus($skus: [String!]!) {
      products(skus: $skus) {
        sku
        name
        urlKey
        inStock
        addToCartAllowed
        images {
          url
          label
          roles
        }
        attributes {
          name
          label
          value
        }
        ... on SimpleProductView {
          price {
            regular {
              amount {
                value
                currency
              }
            }
            final {
              amount {
                value
                currency
              }
            }
          }
        }
        ... on ComplexProductView {
          priceRange {
            minimum {
              regular {
                amount {
                  value
                  currency
                }
              }
              final {
                amount {
                  value
                  currency
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await CS_FETCH_GRAPHQL.fetchGraphQl(query, {
      method: 'POST',
      variables: { skus },
    });

    if (response.errors || !response.data?.products) {
      return [];
    }

    return response.data.products
      .filter(Boolean)
      .map(normalizeProductView)
      .filter(Boolean);
  } catch (err) {
    return [];
  }
}

async function fetchAssignedRelationsCS(skuInput, relationType = 'related') {
  if (!skuInput) return [];
  const skus = (Array.isArray(skuInput) ? skuInput : [skuInput]).filter(Boolean);
  if (skus.length === 0) return [];

  const query = `
    query GetProductRelationsCS($skus: [String!]!) {
      products(skus: $skus) {
        sku
        name
        links {
          linkTypes
          product {
            sku
            name
            urlKey
            inStock
            addToCartAllowed
            images {
              url
              label
              roles
            }
            attributes {
              name
              label
              value
            }
            ... on SimpleProductView {
              price {
                regular {
                  amount {
                    value
                    currency
                  }
                }
                final {
                  amount {
                    value
                    currency
                  }
                }
              }
            }
            ... on ComplexProductView {
              priceRange {
                minimum {
                  regular {
                    amount {
                      value
                      currency
                    }
                  }
                  final {
                    amount {
                      value
                      currency
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await CS_FETCH_GRAPHQL.fetchGraphQl(query, {
      method: 'POST',
      variables: { skus },
    });

    if (response.errors || !response.data?.products) {
      return [];
    }

    const inputSkuSet = new Set(skus);
    const results = [];
    const seenSkus = new Set();

    response.data.products.forEach((product) => {
      const links = product?.links || [];
      const matchingLinks = links.filter((link) => (
        matchesRelationType(link.linkTypes, relationType)
      ));

      matchingLinks.forEach((link) => {
        const item = link.product;
        if (item?.sku && !inputSkuSet.has(item.sku) && !seenSkus.has(item.sku)) {
          seenSkus.add(item.sku);
          const normalized = normalizeProductView(item);
          if (normalized) {
            results.push(normalized);
          }
        }
      });
    });

    return results;
  } catch (err) {
    return [];
  }
}

async function fetchAssignedRelationsCore(skuInput, relationType = 'related') {
  if (!skuInput) return [];
  const skus = (Array.isArray(skuInput) ? skuInput : [skuInput]).filter(Boolean);
  if (skus.length === 0) return [];

  const relationFieldMap = {
    related: 'related_products',
    upsell: 'upsell_products',
    crosssell: 'crosssell_products',
  };
  const targetField = relationFieldMap[relationType] || 'related_products';

  const query = `
    query GetProductRelationsCore($skus: [String]!) {
      products(filter: { sku: { in: $skus } }) {
        items {
          sku
          ${targetField} {
            sku
            name
            url_key
            small_image {
              url
              label
            }
            price_range {
              minimum_price {
                final_price {
                  value
                  currency
                }
                regular_price {
                  value
                  currency
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await CORE_FETCH_GRAPHQL.fetchGraphQl(query, {
      method: 'POST',
      variables: { skus },
    });

    if (response.errors || !response.data?.products?.items) {
      return [];
    }

    const inputSkuSet = new Set(skus);
    const results = [];
    const seenSkus = new Set();

    response.data.products.items.forEach((item) => {
      const relatedItems = item[targetField] || [];
      relatedItems.forEach((relItem) => {
        const isValid = relItem?.sku
          && !inputSkuSet.has(relItem.sku)
          && !seenSkus.has(relItem.sku);
        if (isValid) {
          seenSkus.add(relItem.sku);
          const normalized = normalizeProductView(relItem);
          if (normalized) {
            results.push(normalized);
          }
        }
      });
    });

    return results;
  } catch (err) {
    return [];
  }
}

async function fetchRelationProducts(sku, config, relationType = 'related') {
  // 1. Check if author specified explicit SKUs in block config
  const skuConfig = config.productskus || config['product-skus']
    || config.productSkus || config.skus;
  const specifiedSkus = skuConfig
    ? String(skuConfig).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  if (specifiedSkus.length > 0) {
    const products = await fetchProductsBySkus(specifiedSkus);
    if (products.length > 0) {
      return products;
    }
  }

  // 2. Fetch assigned relations from SKU via Catalog Service GraphQL
  if (sku && (typeof sku === 'string' || (Array.isArray(sku) && sku.length > 0))) {
    const csRelations = await fetchAssignedRelationsCS(sku, relationType);
    if (csRelations.length > 0) {
      return csRelations;
    }

    // 3. Fallback to Core GraphQL if Catalog Service didn't return assigned relations
    const coreRelations = await fetchAssignedRelationsCore(sku, relationType);
    if (coreRelations.length > 0) {
      return coreRelations;
    }
  }

  return [];
}

/**
 * Builds a Little Farms styled product card slide for Splide matching styles.css.
 * @param {any} product
 * @param {typeof import('@dropins/storefront-cart/api.js')} cartApi
 * @param {typeof import('@dropins/storefront-wishlist/api.js')} api
 * @returns {HTMLElement}
 */
function buildProductSlide(product, cartApi, api) {
  const slide = document.createElement('li');
  slide.className = 'splide__slide product-relations__slide tfs-product-slider__slide';

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
  img.src = product.imageUrl || '/styles/images/placeholder.jpg';
  img.alt = product.imageLabel || product.name;
  img.loading = 'lazy';
  img.width = 255;
  img.height = 255;
  photoLink.append(img);

  // Optional Badge (e.g. Save %)
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
      showWishlistLoginToast(() => {
        showWishlistAuthModal();
      });
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
    const isRemove = !!existing;

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
      console.error('Product Relations: wishlist toggle failed', err);
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

      const previousQuantity = cartApi?.getCartDataFromCache()?.totalQuantity ?? 0;
      const cart = await cartApi?.addProductsToCart([{ sku: product.sku, quantity: 1 }]);

      if (!wasProductAddedToCart(cart, product.sku, previousQuantity)) {
        throw new Error('Product was not added to your cart. Please try again.');
      }

      try {
        await cartApi?.getCartData();
      } catch {
        // Cart refresh is best-effort
      }

      await showCartSuccessToast(product.name, () => {
        window.location.href = rootLink('/cart');
      });
    } catch (err) {
      await showCartErrorToast(getCartErrorMessage(err));
      console.error('Product Relations: add to cart failed', err);
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
 * Standardized Commerce Product Relations Block Decorator
 * @param {HTMLElement} block
 */
export default async function decorate(block) {
  const config = readBlockConfig(block);
  const rawContent = block.textContent;
  block.textContent = '';

  let cartApi = null;
  try {
    cartApi = await import('@dropins/storefront-cart/api.js');
  } catch (err) {
    console.debug('Failed to import storefront-cart:', err);
  }

  const labels = await fetchPlaceholders();

  // Show loading indicator
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'product-relations-loading';
  loadingDiv.textContent = labels.Global?.LoadingProducts || 'Loading...';
  block.appendChild(loadingDiv);

  // Parse relation type from block config or text content
  const rawText = [
    config['product-relations'],
    config.relation,
    config.type,
    config['relation-type'],
    ...Object.values(config),
    rawContent,
  ].filter(Boolean).join(' ').toLowerCase();

  let authorInput = 'related';
  if (rawText.includes('cross')) {
    authorInput = 'crosssell';
  } else if (rawText.includes('upsell') || rawText.includes('up')) {
    authorInput = 'upsell';
  }

  const relation = RELATION_REGISTRY[authorInput] || RELATION_REGISTRY.related;
  const headingTitle = config.title || config.heading || relation.defaultTitle;

  // Resolve product SKU (PDP or Cart)
  let sku = getProductSku();
  if (!sku) {
    sku = document.querySelector('meta[name="product-sku"]')?.content
      || document.querySelector('meta[name="sku"]')?.content;
  }

  if (!sku) {
    sku = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 800);
      events.on('pdp/data', (data) => {
        clearTimeout(timer);
        resolve(data?.sku || data?.topLevelSku || null);
      }, { eager: true });
    });
  }

  if (!sku || (Array.isArray(sku) && sku.length === 0)) {
    try {
      if (cartApi) {
        let cartData = cartApi.getCartDataFromCache();
        if (!cartData || !cartData.items || cartData.items.length === 0) {
          cartData = await Promise.race([
            cartApi.getCartData(),
            new Promise((resolve) => {
              events.on('cart/data', (data) => resolve(data), { eager: true });
              setTimeout(() => resolve(null), 1500);
            }),
          ]);
        }
        if (cartData?.items && cartData.items.length > 0) {
          sku = cartData.items
            .map((item) => item.topLevelSku || item.sku)
            .filter(Boolean);
        }
      }
    } catch (err) {
      // Ignore error
    }
  }

  // Fetch related products
  const items = await fetchRelationProducts(sku, config, authorInput);

  // Remove loading indicator
  loadingDiv.remove();

  if (!items || items.length === 0) {
    block.style.display = 'none';
    const wrapper = block.closest('.product-relations-wrapper');
    if (wrapper) {
      wrapper.style.display = 'none';
    }
    return;
  }

  // Render product relations slider container as per tfs-product-slider
  block.setAttribute('data-relation-type', authorInput);
  block.replaceChildren();

  const container = document.createElement('div');
  container.className = 'product-relations__container tfs-product-slider__container';

  if (headingTitle) {
    const panel = document.createElement('div');
    panel.className = 'product-relations__panel tfs-product-slider__panel block-heading';

    const titleBox = document.createElement('div');
    titleBox.className = 'block-title';
    const h = document.createElement('h2');
    h.className = 'product-relations__panel-title tfs-product-slider__panel-title';
    h.textContent = headingTitle;
    titleBox.append(h);
    panel.append(titleBox);

    container.append(panel);
  }

  const sliderMount = document.createElement('div');
  sliderMount.className = 'product-relations__slider tfs-product-slider__slider slider-wrap';

  const splideEl = document.createElement('div');
  splideEl.className = 'splide product-relations__splide tfs-product-slider__splide';
  splideEl.setAttribute('aria-label', headingTitle || 'Related Products');

  const track = document.createElement('div');
  track.className = 'splide__track';

  const list = document.createElement('ul');
  list.className = 'splide__list';

  track.append(list);

  const arrows = document.createElement('div');
  arrows.className = 'splide__arrows product-relations__arrows tfs-product-slider__arrows';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'splide__arrow splide__arrow--prev product-relations__arrow product-relations__arrow--prev';
  prevBtn.setAttribute('aria-label', 'Previous');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'splide__arrow splide__arrow--next product-relations__arrow product-relations__arrow--next';
  nextBtn.setAttribute('aria-label', 'Next');

  arrows.append(prevBtn, nextBtn);
  splideEl.append(track, arrows);
  sliderMount.append(splideEl);
  container.append(sliderMount);
  block.append(container);

  items.forEach((product) => {
    const slide = buildProductSlide(product, cartApi, wishlistApi);
    list.append(slide);
  });

  const splide = new Splide(splideEl, {
    type: 'slide',
    rewind: false,
    perPage: 5,
    perMove: 1,
    gap: '25px',
    padding: { right: '100px' },
    pagination: true,
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
        pagination: true,
      },
      576: {
        perPage: 2,
        perMove: 1,
        padding: { right: '35px' },
        gap: '15px',
        arrows: false,
        pagination: true,
      },
    },
  });

  splide.mount();

  resyncWishlistButtons(block, wishlistApi);

  events.on('wishlist/data', () => {
    resyncWishlistButtons(block, wishlistApi);
  });
  events.on('authenticated', () => {
    resyncWishlistButtons(block, wishlistApi);
  });
}
