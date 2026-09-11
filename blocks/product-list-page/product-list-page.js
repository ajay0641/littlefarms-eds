// Product Discovery Dropins
import Facets from '@dropins/storefront-product-discovery/containers/Facets.js';
import { render as provider } from '@dropins/storefront-product-discovery/render.js';
import { Button, Icon, provider as UI } from '@dropins/tools/components.js';
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
import { fetchPlaceholders, getCategoryFromUrl, getProductLink } from '../../scripts/commerce.js';
import { getCategoryAncestors } from '../../scripts/menu-data.js';
import { PLP_IMAGE_DIMENSIONS, withProductImageFallback } from '../../scripts/product-image.js';
import { fetchCategoryDetails } from './category-details.js';
import {
  createAddToCartButton,
  createProductDetails,
  markProductItemCard,
  replaceWithEmpty,
} from './plp-product-card.js';
import { getSearchStateFromUrl, applySearchStateToUrl } from './search-url.js';
import { initSortDropdown } from './plp-sort-dropdown.js';
import PlpSearchResults from './plp-search-results.js';
import { createLoadMoreController } from './load-more.js';
import { createScrollPageUrlSync } from './scroll-page-url.js';

// Initializers
import '../../scripts/initializers/search.js';
import '../../scripts/initializers/wishlist.js';

export default async function decorate(block) {
  const labels = await fetchPlaceholders();

  const config = readBlockConfig(block);
  const categoryMeta = getCategoryFromUrl();
  const pageSize = parseInt(config.pagesize, 10) || 9;

  // Override authored urlpath with the category from the live URL (folder mapping /
  // menu redirect via /categories/default + sessionStorage / ?cp=).
  const urlCategoryPath = categoryMeta?.urlPath;
  if (urlCategoryPath) {
    config.urlpath = urlCategoryPath;
  }

  const fragment = document.createRange().createContextualFragment(`
    <div class="search__wrapper">
      <div class="search__view-facets"></div>
      <div class="search__facets">
        <div class="search__filters-heading">
          <h2 class="search__filters-title">${labels.Global?.Filters || 'Filters'}</h2>
          <button type="button" class="search__filters-clear" aria-label="Clear all filters" hidden>Clear All</button>
        </div>
        <div class="search__facets-list"></div>
      </div>
      <div class="search__toolbar">
        <div class="search__result-info"></div>
        <div class="search__product-sort"></div>
      </div>
      <div class="search__product-list"></div>
      <div class="search__pagination"></div>
    </div>
  `);

  const $resultInfo = fragment.querySelector('.search__result-info');
  const $viewFacets = fragment.querySelector('.search__view-facets');
  const $facets = fragment.querySelector('.search__facets');
  const $filtersClear = fragment.querySelector('.search__filters-clear');
  const $facetsList = fragment.querySelector('.search__facets-list');
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

  $filtersClear.addEventListener('click', () => {
    loadMoreController?.reset();
    scrollPageUrlSync?.reset();
    search({
      ...lastSearchRequest,
      filter: (lastSearchRequest.filter || []).filter((item) => SYSTEM_FILTERS.has(item.attribute)),
      currentPage: 1,
      pageSize,
    }).catch(() => {
      console.error('Error searching for products');
    });
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

  const handleAddToCart = (product) => {
    if (requiresPdpConfiguration(product)) {
      window.location.href = getProductLink(product.urlKey, product.sku);
      return;
    }
    if (!product.inStock) return;
    cartApi.addProductsToCart([{ sku: product.sku, quantity: 1 }]);
  };

  await Promise.all([
    // View Facets Button
    UI.render(Button, {
      children: labels.Global?.Filters,
      icon: Icon({ source: 'Burger' }),
      variant: 'secondary',
      onClick: () => {
        $facets.classList.toggle('search__facets--visible');
      },
    })($viewFacets),

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

          const imageProps = withProductImageFallback(defaultImageProps, product);

          tryRenderAemAssetsImage(ctx, {
            alias: product.sku,
            imageProps: {
              ...imageProps,
              className: 'product-image-photo',
              width,
              height,
              params: { ...imageProps.params, width, height },
            },
            wrapper: anchorWrapper,
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
          wishlistRender.render(WishlistToggle, {
            product,
            variant: 'tertiary',
          })($wishlistToggle);
          const atcEl = createAddToCartButton(product, {
            label: `${labels.Global?.AddProductToCart || 'Add to Cart'} ${productName}`,
            disabled: !product.inStock && !requiresPdpConfiguration(product),
            onClick: handleAddToCart,
          });
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
    $filtersClear.hidden = !hasUserFilters(payload.request?.filter);

    const phrase = payload.request?.phrase;
    $resultInfo.textContent = phrase
      ? `${totalCount} products found for "${phrase}"`
      : `${totalCount} products found`;

    // Update the view facets button with the number of filters
    if (payload.request.filter.length > 0) {
      $viewFacets.querySelector('button').setAttribute('data-count', payload.request.filter.length);
    } else {
      $viewFacets.querySelector('button').removeAttribute('data-count');
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
