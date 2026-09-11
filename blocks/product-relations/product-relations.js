import { events } from '@dropins/tools/event-bus.js';
import * as wishlistApi from '@dropins/storefront-wishlist/api.js';
import { readBlockConfig } from '../../scripts/aem.js';
import {
  checkIsAuthenticated,
  CORE_FETCH_GRAPHQL,
  CS_FETCH_GRAPHQL,
  fetchPlaceholders,
  getProductLink,
  getProductSku,
  rootLink,
} from '../../scripts/commerce.js';
import '../../scripts/initializers/wishlist.js';
import {
  showWishlistErrorToast,
  showWishlistLoginToast,
  showWishlistSuccessToast,
} from '../../scripts/components/tfs-wishlist-toast/tfs-wishlist-toast.js';
import { showWishlistAuthModal } from '../../scripts/wishlist-auth-modal.js';

function showNotification(options) {
  if (typeof window.showNotification === 'function') {
    window.showNotification(options);
  }
}

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

events.on('wishlist/alert', ({ action, item }) => {
  const productName = item?.product?.name || 'Product';
  const routeToWishlist = rootLink('/wishlist');
  if (action === 'add') {
    showNotification({
      type: 'success',
      message: `${productName} has been added to your Wish List.`,
      linkText: 'View Wish List',
      linkUrl: routeToWishlist,
    });
  } else if (action === 'remove') {
    showNotification({
      type: 'info',
      message: `${productName} has been removed from your Wish List.`,
      linkText: 'View Wish List',
      linkUrl: routeToWishlist,
    });
  } else if (action === 'addError') {
    showNotification({
      type: 'error',
      message: `Could not add ${productName} to your Wish List.`,
    });
  } else if (action === 'removeError') {
    showNotification({
      type: 'error',
      message: `Could not remove ${productName} from your Wish List.`,
    });
  }
}, { eager: true });

function updateWishlistButtonState(button, sku) {
  if (!button || !sku) return;
  if (!checkIsAuthenticated()) {
    button.classList.remove('is-active');
    button.setAttribute('aria-pressed', 'false');
    const path = button.querySelector('path');
    if (path) path.setAttribute('fill', 'none');
    return;
  }
  const inWishlist = !!wishlistApi.findInPersistedAllWishlistItems(sku);
  button.classList.toggle('is-active', inWishlist);
  button.setAttribute('aria-pressed', inWishlist ? 'true' : 'false');
  const path = button.querySelector('path');
  if (path) {
    path.setAttribute('fill', inWishlist ? 'currentColor' : 'none');
  }
}

function formatPrice(value, currency = 'USD') {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function resolveImageUrl(url = '') {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function matchesRelationType(linkTypes = [], targetType = 'related') {
  const normalizedTarget = targetType.toLowerCase().replace(/[^a-z]/g, '');
  return linkTypes.some((type) => {
    const norm = String(type).toLowerCase().replace(/[^a-z]/g, '');
    return norm.includes(normalizedTarget) || normalizedTarget.includes(norm);
  });
}

function normalizeProductView(pv) {
  if (!pv) return null;

  let imageUrl = '';
  let imageLabel = pv.name || 'Product';
  if (pv.small_image?.url) {
    imageUrl = pv.small_image.url;
    imageLabel = pv.small_image.label || imageLabel;
  } else if (Array.isArray(pv.images)) {
    const primaryImg = pv.images.find((img) => img.roles?.includes('image')) || pv.images[0];
    imageUrl = primaryImg?.url || '';
    imageLabel = primaryImg?.label || imageLabel;
  }

  const priceObj = pv.price || pv.priceRange?.minimum || pv.price_range?.minimum_price || {};
  const finalPrice = priceObj.final?.amount?.value ?? priceObj.final_price?.value;
  const regularPrice = priceObj.regular?.amount?.value ?? priceObj.regular_price?.value;
  const currency = priceObj.final?.amount?.currency
    || priceObj.regular?.amount?.currency
    || priceObj.final_price?.currency
    || priceObj.regular_price?.currency
    || 'USD';

  return {
    sku: pv.sku,
    name: pv.name || 'Product',
    url_key: pv.urlKey || pv.url_key || pv.sku,
    small_image: {
      url: resolveImageUrl(imageUrl),
      label: imageLabel,
    },
    price_range: {
      minimum_price: {
        final_price: {
          value: finalPrice,
          currency,
        },
        regular_price: {
          value: regularPrice,
          currency,
        },
      },
    },
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
        images {
          url
          label
          roles
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
            images {
              url
              label
              roles
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
        if (item && item.sku && !inputSkuSet.has(item.sku) && !seenSkus.has(item.sku)) {
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
        const isValid = relItem
          && relItem.sku
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
  const skuConfig = config.productskus || config['product-skus'] || config.productSkus || config.skus;
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

  // If no assigned relations found, do not render block
  return [];
}

function setupSlider(track, prevBtn, nextBtn) {
  const getMaxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);

  const updateButtons = () => {
    requestAnimationFrame(() => {
      const maxScroll = getMaxScroll();
      const atStart = track.scrollLeft <= 0;
      const atEnd = track.scrollLeft >= Math.max(0, maxScroll - 1);
      prevBtn.disabled = atStart;
      nextBtn.disabled = atEnd;
    });
  };

  const scrollStep = () => Math.max(track.clientWidth * 0.75, 280);

  prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -scrollStep(), behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: scrollStep(), behavior: 'smooth' });
  });

  track.addEventListener('scroll', updateButtons, { passive: true });
  window.addEventListener('resize', updateButtons);

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(updateButtons);
    resizeObserver.observe(track);
  }

  track.querySelectorAll('img').forEach((img) => {
    if (img.complete) {
      updateButtons();
    } else {
      img.addEventListener('load', updateButtons, { once: true });
    }
  });

  requestAnimationFrame(updateButtons);
  window.setTimeout(updateButtons, 100);
}

/**
 * Standardized Commerce Product Relations Block Decorator
 * @param {HTMLElement} block
 */
export default async function decorate(block) {
  // 1. Extract block configuration BEFORE clearing HTML
  const config = readBlockConfig(block);

  // 2. IMMEDIATELY clear original block table HTML so un-decorated table is hidden instantly
  const rawContent = block.textContent;
  block.textContent = '';

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
  const subtitle = config.subtitle || config.subTitle || config['sub-title'];

  // 3. Resolve product SKU (PDP or Cart)
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
      const cartApi = await import('@dropins/storefront-cart/api.js');
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
    } catch (err) {
      // Ignore error
    }
  }

  // 4. Fetch related products
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

  // 5. Render product relations heading/subtitle and slider container
  block.setAttribute('data-relation-type', authorInput);

  const headerContainer = document.createElement('div');
  headerContainer.className = 'product-relations-header';

  const sectionHeading = document.createElement('h3');
  sectionHeading.className = 'product-relations-heading';
  sectionHeading.textContent = headingTitle;
  headerContainer.appendChild(sectionHeading);

  if (subtitle) {
    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'product-relations-subtitle';
    subtitleEl.textContent = subtitle;
    headerContainer.appendChild(subtitleEl);
  }

  block.appendChild(headerContainer);

  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'product-relations-container';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'product-relations-arrow product-relations-prev';
  prevBtn.setAttribute('aria-label', 'Previous products');
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';

  const gridContainer = document.createElement('div');
  gridContainer.className = 'product-relations-grid';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'product-relations-arrow product-relations-next';
  nextBtn.setAttribute('aria-label', 'Next products');
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M9 6 7.59 7.41 12.17 12l-4.58 4.59L9 18l6-6z"/></svg>';

  items.forEach((item) => {
    const productUrl = getProductLink(item.url_key, item.sku);

    const card = document.createElement('div');
    card.className = 'product-relations-card dropin-product-item-card';

    const imgUrl = resolveImageUrl(item.small_image?.url) || '/styles/images/placeholder.jpg';
    const imgAlt = item.small_image?.label || item.name || 'Product';

    const minPrice = item.price_range?.minimum_price;
    const finalPriceVal = minPrice?.final_price?.value;
    const regularPriceVal = minPrice?.regular_price?.value;
    const currency = minPrice?.final_price?.currency || 'USD';

    const formattedFinalPrice = formatPrice(finalPriceVal, currency);
    const formattedRegularPrice = (regularPriceVal && regularPriceVal > finalPriceVal)
      ? formatPrice(regularPriceVal, currency)
      : '';

    const imageContainer = document.createElement('div');
    imageContainer.className = 'dropin-product-item-card__image-container relation-media-container';

    const imageAnchor = document.createElement('a');
    imageAnchor.className = 'relation-image-anchor dropin-product-item-card__image';
    imageAnchor.href = productUrl;
    imageAnchor.setAttribute('aria-label', item.name || 'Product');

    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = imgAlt;
    img.loading = 'lazy';
    img.width = 240;
    img.height = 240;
    imageAnchor.appendChild(img);
    imageContainer.appendChild(imageAnchor);

    const cardActions = document.createElement('div');
    cardActions.className = 'product-relations-card__actions dropin-product-item-card__action';

    const addToCartBtn = document.createElement('button');
    addToCartBtn.type = 'button';
    addToCartBtn.className = 'product-relations-card__action-btn product-relations-card__atc';
    addToCartBtn.setAttribute('aria-label', labels.Global?.AddProductToCart || 'Add to Cart');
    addToCartBtn.innerHTML = '<svg class="product-relations-card__action-btn-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 30 30" fill="none"><g transform="translate(-0.066 0.212)"><circle cx="2" cy="2" r="2" transform="translate(7.066 23.788)" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="2" cy="2" r="2" transform="translate(20.066 23.788)" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11.983,36.645H32.818L29.752,47.376a1.847,1.847,0,0,1-1.788,1.347H16.838a1.847,1.847,0,0,1-1.788-1.347l-4.2-14.7A.929.929,0,0,0,9.951,32H8" transform="translate(-7.063 -28.309)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></g></svg>';

    addToCartBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (addToCartBtn.disabled) return;
      addToCartBtn.disabled = true;
      try {
        const cartApi = await import('@dropins/storefront-cart/api.js');
        await cartApi.addProductsToCart([{ sku: item.sku, quantity: 1 }]);
        showNotification({
          type: 'success',
          message: `${item.name || 'Product'} has been added to your cart.`,
          linkText: 'View Cart',
          linkUrl: rootLink('/cart'),
        });
      } catch (err) {
        showNotification({
          type: 'error',
          message: `Could not add ${item.name || 'Product'} to cart.`,
        });
      } finally {
        addToCartBtn.disabled = false;
      }
    });

    const wishlistBtn = document.createElement('button');
    wishlistBtn.type = 'button';
    wishlistBtn.className = 'product-relations-card__action-btn product-relations-card__wishlist';
    wishlistBtn.dataset.sku = item.sku;
    wishlistBtn.setAttribute('aria-label', labels.Global?.AddToWishlist || 'Add to Wishlist');
    wishlistBtn.innerHTML = '<svg class="product-relations-card__action-btn-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 30 30" fill="none"><g transform="translate(-0.393)"><path d="M39.827,60.811S28,54.188,28,46.146A6.15,6.15,0,0,1,39.827,43.78h0a6.15,6.15,0,0,1,11.827,2.365C51.654,54.188,39.827,60.811,39.827,60.811Z" transform="translate(-24.688 -35.265)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/></g></svg>';

    updateWishlistButtonState(wishlistBtn, item.sku);

    wishlistBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!checkIsAuthenticated()) {
        showWishlistLoginToast(() => {
          showWishlistAuthModal();
        });
        return;
      }

      if (wishlistBtn.disabled) return;
      wishlistBtn.disabled = true;

      try {
        wishlistApi.setEndpoint(CORE_FETCH_GRAPHQL);
        const existing = wishlistApi.findInPersistedAllWishlistItems(item.sku);
        const isRemove = !!existing;

        if (isRemove) {
          await wishlistApi.removeProductsFromWishlist([existing]);
        } else {
          await wishlistApi.addProductsToWishlist([{ sku: item.sku, quantity: 1 }]);
        }
        updateWishlistButtonState(wishlistBtn, item.sku);
        await showWishlistSuccessToast(isRemove ? 'remove' : 'add', item.name);
      } catch (err) {
        await showWishlistErrorToast(err?.message || 'Could not update wishlist.');
      } finally {
        wishlistBtn.disabled = false;
      }
    });

    cardActions.append(addToCartBtn, wishlistBtn);
    imageContainer.appendChild(cardActions);

    const details = document.createElement('div');
    details.className = 'relation-card-details dropin-product-item-card__content';

    const titleAnchor = document.createElement('a');
    titleAnchor.className = 'relation-title-anchor dropin-product-item-card__title';
    titleAnchor.href = productUrl;

    const nameEl = document.createElement('h4');
    nameEl.className = 'relation-product-name';
    nameEl.textContent = item.name || 'Product';
    titleAnchor.appendChild(nameEl);

    const priceContainer = document.createElement('div');
    priceContainer.className = 'relation-price-container dropin-product-item-card__price';

    if (formattedFinalPrice) {
      const fromEl = document.createElement('span');
      fromEl.className = 'relation-price-from';
      fromEl.textContent = 'From: ';
      priceContainer.appendChild(fromEl);

      if (formattedRegularPrice) {
        const regularPriceEl = document.createElement('span');
        regularPriceEl.className = 'relation-product-price-regular';
        regularPriceEl.textContent = formattedRegularPrice;
        priceContainer.appendChild(regularPriceEl);
      }

      const finalPriceEl = document.createElement('span');
      finalPriceEl.className = 'relation-product-price';
      finalPriceEl.textContent = formattedFinalPrice;
      priceContainer.appendChild(finalPriceEl);
    }

    details.append(titleAnchor, priceContainer);

    if (regularPriceVal && regularPriceVal > finalPriceVal) {
      const savePercent = Math.round(((regularPriceVal - finalPriceVal) / regularPriceVal) * 100);
      if (savePercent > 0) {
        const saveEl = document.createElement('div');
        saveEl.className = 'relation-save-badge';
        saveEl.textContent = `Save up to ${savePercent}%`;
        details.appendChild(saveEl);
      }
    }

    card.append(imageContainer, details);
    gridContainer.appendChild(card);
  });

  sliderContainer.append(prevBtn, gridContainer, nextBtn);
  block.appendChild(sliderContainer);

  const resyncWishlist = () => {
    block.querySelectorAll('.product-relations-card__wishlist').forEach((btn) => {
      if (btn.dataset.sku) updateWishlistButtonState(btn, btn.dataset.sku);
    });
  };

  events.on('wishlist/data', resyncWishlist);
  events.on('authenticated', resyncWishlist);

  setupSlider(gridContainer, prevBtn, nextBtn);
}
