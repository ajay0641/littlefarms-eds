// Product Discovery Dropins
import Facets from '@dropins/storefront-product-discovery/containers/Facets.js';
import { render as provider } from '@dropins/storefront-product-discovery/render.js';
import { search } from '@dropins/storefront-product-discovery/api.js';
// Wishlist Dropin
import { WishlistToggle } from '@dropins/storefront-wishlist/containers/WishlistToggle.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';
// Cart Dropin
import * as cartApi from '@dropins/storefront-cart/api.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
// Event Bus
import { events } from '@dropins/tools/event-bus.js';
// AEM
import { readBlockConfig } from '../../scripts/aem.js';
import {
  fetchPlaceholders,
  getCategoryFromUrl,
  getProductLink,
  checkIsAuthenticated,
} from '../../scripts/commerce.js';
import { getCategoryAncestors } from '../../scripts/menu-data.js';
import { PLP_IMAGE_DIMENSIONS, withProductImageFallback } from '../../scripts/product-image.js';
import { fetchCategoryDetails } from './category-details.js';
import { fetchCatalogGridPagination } from './catalog-pagination.js';
import {
  createAddToCartButton,
  createProductBadges,
  createProductDetails,
  markProductItemCard,
  replaceWithEmpty,
} from './plp-product-card.js';
import { getSearchStateFromUrl, applySearchStateToUrl } from './search-url.js';
import { initSortDropdown } from './plp-sort-dropdown.js';
import PlpSearchResults from './plp-search-results.js';
import { createLoadMoreController } from './load-more.js';
import { createScrollPageUrlSync } from './scroll-page-url.js';
import { showShoppingListAlert } from '../../scripts/components/shopping-list-alert/shopping-list-alert.js';
import {
  showWishlistErrorToast,
  showWishlistSuccessToast,
} from '../../scripts/components/tfs-wishlist-toast/tfs-wishlist-toast.js';

// Initializers
import '../../scripts/initializers/search.js';
import '../../scripts/initializers/wishlist.js';
import '../../scripts/initializers/cart.js';

export default async function decorate(block) {
  const labels = await fetchPlaceholders();

  const config = readBlockConfig(block);
  const categoryMeta = getCategoryFromUrl();

  // Magento admin: Stores → Configuration → Catalog → Catalog → Storefront
  // (grid_per_page / grid_per_page_values). Authored block pageSize overrides when set.
  const { gridPerPage, gridPerPageValues } = await fetchCatalogGridPagination();
  const authoredPageSize = parseInt(config.pagesize, 10);
  const pageSize = (Number.isFinite(authoredPageSize) && authoredPageSize > 0)
    ? authoredPageSize
    : gridPerPage;
  block.dataset.gridPerPage = String(pageSize);
  block.dataset.gridPerPageValues = gridPerPageValues.join(',');

  // Override authored urlpath with the category from the live URL (folder mapping /
  // menu redirect via /categories/default + sessionStorage / ?cp=).
  const urlCategoryPath = categoryMeta?.urlPath;
  if (urlCategoryPath) {
    config.urlpath = urlCategoryPath;
  }

  const fragment = document.createRange().createContextualFragment(`
    <div class="search__wrapper">
      <div class="search__facets-overlay" hidden></div>
      <div class="search__facets" id="search-facets-panel">
        <div class="search__filters-heading">
          <h2 class="search__filters-title">${labels.Global?.Filters || 'Filters'}</h2>
          <button type="button" class="search__filters-clear search__filters-clear--inline" aria-label="Clear all filters" hidden>Clear All</button>
          <button type="button" class="search__filters-close" aria-label="Close filters"></button>
        </div>
        <div class="search__facets-scroll">
          <div class="search__facets-list"></div>
        </div>
        <div class="search__filters-footer">
          <button type="button" class="search__filters-clear search__filters-clear--footer" aria-label="Clear all filters" hidden>Clear All</button>
          <button type="button" class="search__filters-apply">Show 0 products</button>
        </div>
      </div>
      <div class="search__toolbar-sentinel" aria-hidden="true"></div>
      <div class="search__toolbar">
        <div class="search__product-sort"></div>
        <button type="button" class="search__filter-trigger" aria-expanded="false" aria-controls="search-facets-panel">
          <span class="search__filter-trigger-icon" aria-hidden="true"></span>
          <span class="search__filter-trigger-label">${labels.Global?.Filter || 'Filter'}</span>
        </button>
        <div class="search__result-info"></div>
      </div>
      <div class="search__product-list"></div>
      <div class="search__pagination"></div>
    </div>
  `);

  const $resultInfo = fragment.querySelector('.search__result-info');
  const $facetsOverlay = fragment.querySelector('.search__facets-overlay');
  const $facets = fragment.querySelector('.search__facets');
  const $filtersClearButtons = [...fragment.querySelectorAll('.search__filters-clear')];
  const $filtersClose = fragment.querySelector('.search__filters-close');
  const $filtersApply = fragment.querySelector('.search__filters-apply');
  const $facetsList = fragment.querySelector('.search__facets-list');
  const $toolbarSentinel = fragment.querySelector('.search__toolbar-sentinel');
  const $filterTrigger = fragment.querySelector('.search__filter-trigger');
  const $productSort = fragment.querySelector('.search__product-sort');
  const $productList = fragment.querySelector('.search__product-list');
  const $pagination = fragment.querySelector('.search__pagination');

  /** @type {Set<string>} */
  const SYSTEM_FILTERS = new Set(['visibility', 'categoryPath']);

  /** @type {Object} */
  let lastSearchRequest = {};

  /** @type {ReturnType<typeof createLoadMoreController>|null} */
  let loadMoreController = null;
  /** @type {ReturnType<typeof createScrollPageUrlSync>|null} */
  let scrollPageUrlSync = null;

  /**
   * Check whether the request includes shopper-applied filters.
   *
   * @param {Array<{attribute?: string}>} [filter=[]]
   * @return {Boolean}
   */
  const hasUserFilters = (filter = []) => filter.some(
    (item) => !SYSTEM_FILTERS.has(item.attribute),
  );

  /**
   * Open or close the mobile filter drawer (Magento `.sidebar-main.active`).
   *
   * @param {Boolean} [force]
   * @return {void}
   */
  const setFacetsOpen = (force) => {
    const visible = typeof force === 'boolean'
      ? force
      : !$facets.classList.contains('search__facets--visible');
    $facets.classList.toggle('search__facets--visible', visible);
    $facetsOverlay.hidden = !visible;
    $filterTrigger.setAttribute('aria-expanded', String(visible));
    document.body.classList.toggle('search-facets-open', visible);
  };

  $filtersClearButtons.forEach(($btn) => {
    $btn.addEventListener('click', () => {
      loadMoreController?.reset();
      scrollPageUrlSync?.reset();
      search({
        ...lastSearchRequest,
        filter: (lastSearchRequest.filter || [])
          .filter((item) => SYSTEM_FILTERS.has(item.attribute)),
        currentPage: 1,
        pageSize,
      }).catch(() => {
        console.error('Error searching for products');
      });
    });
  });

  $filterTrigger.addEventListener('click', () => setFacetsOpen());
  $filtersClose.addEventListener('click', () => setFacetsOpen(false));
  $facetsOverlay.addEventListener('click', () => setFacetsOpen(false));
  $filtersApply.addEventListener('click', () => setFacetsOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $facets.classList.contains('search__facets--visible')) {
      setFacetsOpen(false);
    }
  });

  window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => {
    if (event.matches) setFacetsOpen(false);
  });

  const collapsedFacets = new Set();

  /**
   * Restore accordion open/closed state after Facets re-renders.
   */
  const applyFacetAccordionState = () => {
    $facetsList.querySelectorAll('.product-discovery-facet').forEach((facet) => {
      const header = facet.querySelector('.product-discovery-facet__header');
      if (!header) return;
      const name = header.textContent.trim();
      const collapsed = collapsedFacets.has(name);
      facet.classList.toggle('is-collapsed', collapsed);
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', String(!collapsed));
    });
  };

  /**
   * Toggle a facet accordion section.
   * @param {HTMLElement} header Facet heading element
   */
  const toggleFacetAccordion = (header) => {
    const facet = header.closest('.product-discovery-facet');
    if (!facet) return;
    const name = header.textContent.trim();
    const collapsed = !facet.classList.contains('is-collapsed');
    facet.classList.toggle('is-collapsed', collapsed);
    if (collapsed) collapsedFacets.add(name);
    else collapsedFacets.delete(name);
    header.setAttribute('aria-expanded', String(!collapsed));
  };

  $facets.addEventListener('click', (event) => {
    const header = event.target.closest('.product-discovery-facet__header');
    if (!header) return;
    toggleFacetAccordion(header);
  });

  $facets.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const header = event.target.closest('.product-discovery-facet__header');
    if (!header) return;
    event.preventDefault();
    toggleFacetAccordion(header);
  });

  new MutationObserver(() => applyFacetAccordionState())
    .observe($facetsList, { childList: true, subtree: true });

  block.innerHTML = '';
  block.appendChild(fragment);
  initSortDropdown($productSort, { getPageSize: () => pageSize });

  const plpWrapper = block.parentElement;
  let $categoryHero = plpWrapper?.previousElementSibling;
  if (!$categoryHero?.classList.contains('category-hero')) {
    $categoryHero = document.createElement('div');
    $categoryHero.className = 'category-hero';
    $categoryHero.innerHTML = `
      <div class="search__category-title"></div>
      <div class="search__category-description"></div>
    `;
    plpWrapper?.before($categoryHero);
  }

  const $categoryTitle = $categoryHero.querySelector('.search__category-title');
  const $categoryDescription = $categoryHero.querySelector('.search__category-description');

  const renderCategoryHeading = (name) => {
    if (!name || !$categoryTitle) return;
    let heading = $categoryTitle.querySelector('h1');
    if (!heading) {
      heading = document.createElement('h1');
      $categoryTitle.append(heading);
    }
    heading.textContent = name;
  };

  /**
   * Renders Magento category description under the H1.
   * @param {string|null} descriptionHtml
   */
  const renderCategoryDescription = (descriptionHtml) => {
    if (!$categoryDescription) return;
    const html = (descriptionHtml || '').trim();
    if (!html) {
      $categoryDescription.replaceChildren();
      return;
    }
    $categoryDescription.innerHTML = html;
  };

  if (config.urlpath) {
    window.setTimeout(() => {
      fetchCategoryDetails(config.urlpath)
        .then((details) => {
          if (!details) {
            getCategoryAncestors(config.urlpath)
              .then((ancestors) => renderCategoryHeading(ancestors.at(-1)?.name || null))
              .catch(() => {});
            return;
          }
          renderCategoryHeading(details.name);
          renderCategoryDescription(details.description);
        })
        .catch(() => {
          getCategoryAncestors(config.urlpath)
            .then((ancestors) => renderCategoryHeading(ancestors.at(-1)?.name || null))
            .catch(() => {});
        });
    }, 0);
  }

  // Add url path back to the block for enrichment, incase enrichment block is
  // executed after the plp block and block config is not available
  if (config.urlpath) {
    block.dataset.urlpath = config.urlpath;
  }
  if (categoryMeta?.cateId) {
    block.dataset.categoryId = categoryMeta.cateId;
  }

  const searchState = getSearchStateFromUrl(new URL(window.location.href));
  const initialLoadMorePage = Math.max(1, searchState.loadMorePage || 1);
  const initialFetchSize = pageSize * initialLoadMorePage;

  // Default visibility filter for all of our requests
  const visibilityFilter = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };
  const userFilters = searchState.filter.filter((f) => f.attribute !== 'visibility');

  // Normalize URL (e.g. pipe-separated filter values)
  const normalizedUrl = new URL(window.location.href);
  applySearchStateToUrl(normalizedUrl, searchState, { loadMorePage: initialLoadMorePage });
  window.history.replaceState({}, '', normalizedUrl.toString());

  // Request search based on the page type on block load
  if (config.urlpath) {
    // If it's a category page...
    await search({
      phrase: '', // search all products in the category
      currentPage: 1,
      pageSize: initialFetchSize,
      sort: searchState?.sort?.length ? searchState.sort : [{ attribute: 'position', direction: 'DESC' }],
      filter: [
        { attribute: 'categoryPath', eq: config.urlpath }, // Add category filter
        // Always add visibility filter to the request
        visibilityFilter,
        ...userFilters,
      ],
    }).catch(() => {
      console.error('Error searching for products');
    });
  } else {
    // Search page: dropin uses only the request (no URL parsing).
    await search({
      phrase: searchState.phrase,
      currentPage: 1,
      pageSize: initialFetchSize,
      sort: searchState.sort,
      // Always add visibility filter to the request
      filter: [visibilityFilter, ...userFilters],
    }).catch((e) => {
      console.error('Error searching for products', e);
    });
  }

  const requiresPdpConfiguration = (product) => product.typename === 'ComplexProductView'
    || product.attributes?.some((attr) => attr.name === 'ac_giftcard');

  /**
   * Sync all visible PLP ATC controls from cart data.
   *
   * @param {Object|null|undefined} cart
   * @return {void}
   */
  const syncPlpCartControls = (cart) => {
    $productList.querySelectorAll('.actions-primary').forEach((el) => {
      if (typeof el.syncFromCart === 'function') {
        el.syncFromCart(cart);
      }
    });
  };

  /**
   * Add a simple product to cart (complex products redirect to PDP).
   *
   * @param {Object} product
   * @return {Promise<Object|null|undefined>}
   */
  const handleAddToCart = async (product) => {
    if (requiresPdpConfiguration(product)) {
      window.location.href = getProductLink(product.urlKey, product.sku);
      return null;
    }
    if (!product.inStock) return null;
    return cartApi.addProductsToCart([{ sku: product.sku, quantity: 1 }]);
  };

  /**
   * Update or remove a cart line item quantity.
   *
   * @param {string} uid
   * @param {number} quantity
   * @return {Promise<Object|null|undefined>}
   */
  const handleUpdateCartQty = async (uid, quantity) => cartApi.updateProductsFromCart([
    { uid, quantity },
  ]);

  events.on('cart/data', syncPlpCartControls, { eager: true });
  syncPlpCartControls(cartApi.getCartDataFromCache());

  /**
   * Show success / error toast when wishlist drop-in emits an alert.
   */
  events.on('wishlist/alert', ({ action, item }) => {
    const productName = item?.product?.name || 'Product';
    if (action === 'add' || action === 'remove') {
      showWishlistSuccessToast(action, productName);
      return;
    }
    if (action === 'addError' || action === 'removeError') {
      showWishlistErrorToast(
        action === 'addError'
          ? 'We could not add this product to your wishlist. Please try again.'
          : 'We could not remove this product from your wishlist. Please try again.',
      );
    }
  });

  await Promise.all([
    // Facets
    provider.render(Facets, {
      slots: {
        FacetBucketLabel: (ctx) => {
          const { data } = ctx;
          if (!data || data.__typename === 'RangeBucket' || data.title === 'yes' || data.title === 'no') {
            return;
          }
          const label = document.createElement('span');
          label.textContent = data.title;
          ctx.replaceWith(label);
        },
      },
    })($facetsList),
    // Product List
    provider.render(PlpSearchResults, {
      routeProduct: (product) => getProductLink(product.urlKey, product.sku),
      imageWidth: 255,
      imageHeight: 255,
      onSearchResult: () => {
        requestAnimationFrame(() => {
          $productList.querySelectorAll('.dropin-product-item-card').forEach((card) => {
            card.classList.add('product-item');
          });
        });
      },
      slots: {
        ProductImage: (ctx) => {
          const { product, defaultImageProps } = ctx;
          const width = Number(defaultImageProps?.width) || PLP_IMAGE_DIMENSIONS.width;
          const height = Number(defaultImageProps?.height) || PLP_IMAGE_DIMENSIONS.height;
          const productUrl = getProductLink(product.urlKey, product.sku);
          const anchorWrapper = document.createElement('a');
          anchorWrapper.className = 'product photo product-item-photo';
          anchorWrapper.href = productUrl;
          anchorWrapper.setAttribute('aria-label', product.name || product.sku);

          const imageContainer = document.createElement('span');
          imageContainer.className = 'product-image-wrapper';

          const imageProps = withProductImageFallback(defaultImageProps, product);

          const fakeCtx = {
            replaceWith: (el) => {
              anchorWrapper.prepend(el);
              const badges = createProductBadges(product);
              if (badges) {
                anchorWrapper.append(badges);
              }
              ctx.replaceWith(anchorWrapper);
            },
          };

          tryRenderAemAssetsImage(fakeCtx, {
            alias: product.sku,
            imageProps: {
              ...imageProps,
              className: 'product-image-photo',
              width,
              height,
              params: { ...imageProps.params, width, height },
            },
            wrapper: imageContainer,
            params: { width, height },
          });
          anchorWrapper.querySelector('img')?.classList.add('product-image-photo');
          markProductItemCard(anchorWrapper);
        },
        ProductName: (ctx) => {
          const { product } = ctx;
          const productUrl = getProductLink(product.urlKey, product.sku);
          const productName = product.name || product.sku;
          const $wishlistToggle = document.createElement('div');
          $wishlistToggle.className = 'product-item-wishlist';

          if (!checkIsAuthenticated()) {
            const guestWishlistBtn = document.createElement('button');
            guestWishlistBtn.type = 'button';
            guestWishlistBtn.className = 'action towishlist';
            guestWishlistBtn.setAttribute('aria-label', 'Add to Shopping List');
            guestWishlistBtn.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              showShoppingListAlert();
            });
            $wishlistToggle.append(guestWishlistBtn);
          } else {
            wishlistRender.render(WishlistToggle, {
              product,
              variant: 'tertiary',
            })($wishlistToggle);

            /**
             * Keep Little Farms heart icon filled when drop-in marks item as wishlisted.
             *
             * @return {void}
             */
            const syncWishlistHeart = () => {
              const toggleBtn = $wishlistToggle.querySelector('button, [data-testid="wishlist-toggle"]');
              if (!toggleBtn) return;
              const label = (toggleBtn.getAttribute('aria-label') || '').toLowerCase();
              const wishlisted = label.includes('remove') || label.includes('wishlisted');
              toggleBtn.classList.toggle('is-active', wishlisted);
              toggleBtn.setAttribute('aria-pressed', String(wishlisted));
            };
            syncWishlistHeart();
            const wishlistObserver = new MutationObserver(syncWishlistHeart);
            wishlistObserver.observe($wishlistToggle, {
              attributes: true,
              childList: true,
              subtree: true,
              attributeFilter: ['aria-label', 'class'],
            });
          }

          const atcEl = createAddToCartButton(product, {
            label: `${labels.Global?.AddProductToCart || 'Add to Cart'} ${productName}`,
            addLabel: labels.Global?.AddToCart || 'Add to Cart',
            addingLabel: labels.Global?.Adding || 'Adding...',
            addedLabel: labels.Global?.Added || 'Added',
            disabled: !product.inStock && !requiresPdpConfiguration(product),
            onAdd: handleAddToCart,
            onUpdateQty: handleUpdateCartQty,
          });
          atcEl.syncFromCart?.(cartApi.getCartDataFromCache());
          const details = createProductDetails(product, productUrl, {
            wishlistEl: $wishlistToggle,
            atcEl,
          });
          ctx.replaceWith(details);
          markProductItemCard(details);
        },
        ProductPrice: (ctx) => replaceWithEmpty(ctx),
        ProductActions: (ctx) => replaceWithEmpty(ctx),
      },
    })($productList),
  ]);

  loadMoreController = createLoadMoreController({
    container: $pagination,
    getBatchSize: () => pageSize,
    initialLoadMorePage,
    onSearchContextChange: () => scrollPageUrlSync?.reset(),
    labels: {
      loadMore: labels.Search?.LoadMore || 'Load more products',
      loading: labels.Search?.Loading || 'Loading...',
    },
  });

  scrollPageUrlSync = createScrollPageUrlSync({
    productListRoot: $productList,
    getBatchSize: () => pageSize,
    getLastRequest: () => loadMoreController?.getLastRequest() ?? lastSearchRequest,
    buildUrl: () => new URL(window.location.href),
  });

  // Sticky mobile Sort/Filter bar (matches Magento `.show-filter`)
  if ($toolbarSentinel && typeof IntersectionObserver !== 'undefined') {
    const stickyObserver = new IntersectionObserver(
      ([entry]) => {
        const sticky = !entry.isIntersecting && window.matchMedia('(max-width: 767px)').matches;
        block.classList.toggle('product-list-page--toolbar-sticky', sticky);
        document.body.classList.toggle('plp-toolbar-sticky', sticky);
      },
      { rootMargin: '-60px 0px 0px 0px', threshold: 0 },
    );
    stickyObserver.observe($toolbarSentinel);
  }

  let restoringFromHistory = false;

  const handlePopState = () => {
    restoringFromHistory = true;
    const urlState = getSearchStateFromUrl(new URL(window.location.href));
    const loadMorePage = Math.max(1, urlState.loadMorePage || 1);

    loadMoreController?.reset();
    scrollPageUrlSync?.reset();

    search({
      phrase: config.urlpath ? '' : urlState.phrase,
      currentPage: 1,
      pageSize: pageSize * loadMorePage,
      sort: urlState.sort.length
        ? urlState.sort
        : [{ attribute: 'position', direction: 'DESC' }],
      filter: [
        ...(config.urlpath ? [{ attribute: 'categoryPath', eq: config.urlpath }] : []),
        visibilityFilter,
        ...urlState.filter.filter((item) => item.attribute !== 'visibility'),
      ],
    }).catch(() => {
      console.error('Error searching for products');
    });
  };

  window.addEventListener('popstate', handlePopState);

  // Listen for search results (event is fired before the block is rendered; eager: true)
  events.on('search/result', (payload) => {
    const totalCount = payload.result?.totalCount || 0;

    block.classList.toggle('product-list-page--empty', totalCount === 0);

    lastSearchRequest = payload.request || {};
    const showClear = hasUserFilters(payload.request?.filter);
    $filtersClearButtons.forEach(($btn) => {
      $btn.hidden = !showClear;
    });
    $filtersApply.textContent = `Show ${totalCount} products`;

    const phrase = payload.request?.phrase;
    $resultInfo.textContent = phrase
      ? `${totalCount} products found for "${phrase}"`
      : `${totalCount} products found`;

    // Update the filter trigger with the number of shopper filters
    const userFilterCount = (payload.request?.filter || [])
      .filter((item) => !SYSTEM_FILTERS.has(item.attribute)).length;
    if (userFilterCount > 0) {
      $filterTrigger.setAttribute('data-count', String(userFilterCount));
    } else {
      $filterTrigger.removeAttribute('data-count');
    }

    requestAnimationFrame(() => {
      applyFacetAccordionState();
      scrollPageUrlSync?.refresh();
    });
  }, { eager: true });

  // Listen for search results (event is fired after the block is rendered; eager: false)
  // URL is owned by this project; ?p= reflects the visible load-more batch while scrolling.
  events.on('search/result', (payload) => {
    if (restoringFromHistory) {
      restoringFromHistory = false;
      return;
    }

    const url = new URL(window.location.href);
    const visiblePage = scrollPageUrlSync?.measureNow() ?? 1;
    applySearchStateToUrl(url, payload.request, { loadMorePage: visiblePage });
    if (url.href !== window.location.href) {
      const useReplaceState = loadMoreController?.consumeLoadMoreNavigation();
      if (useReplaceState) {
        window.history.replaceState({}, '', url.toString());
      } else {
        window.history.pushState({}, '', url.toString());
      }
    }
    requestAnimationFrame(applyFacetAccordionState);
  }, { eager: false });
}
