// Product Discovery Dropins
import SearchResults from '@dropins/storefront-product-discovery/containers/SearchResults.js';
import Facets from '@dropins/storefront-product-discovery/containers/Facets.js';
import SortBy from '@dropins/storefront-product-discovery/containers/SortBy.js';
import Pagination from '@dropins/storefront-product-discovery/containers/Pagination.js';
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
      <div class="search__result-info"></div>
      <div class="search__view-facets"></div>
      <div class="search__facets"></div>
      <div class="search__product-sort"></div>
      <div class="search__product-list"></div>
      <div class="search__pagination"></div>
    </div>
  `);

  const $resultInfo = fragment.querySelector('.search__result-info');
  const $viewFacets = fragment.querySelector('.search__view-facets');
  const $facets = fragment.querySelector('.search__facets');
  const $productSort = fragment.querySelector('.search__product-sort');
  const $productList = fragment.querySelector('.search__product-list');
  const $pagination = fragment.querySelector('.search__pagination');

  block.innerHTML = '';
  block.appendChild(fragment);

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

  // Default visibility filter for all of our requests
  const visibilityFilter = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };
  const userFilters = searchState.filter.filter((f) => f.attribute !== 'visibility');

  // Normalize URL (e.g. pipe-separated filter values)
  const normalizedUrl = new URL(window.location.href);
  applySearchStateToUrl(normalizedUrl, searchState);
  window.history.replaceState({}, '', normalizedUrl.toString());

  // Request search based on the page type on block load
  if (config.urlpath) {
    // If it's a category page...
    await search({
      phrase: '', // search all products in the category
      currentPage: searchState.currentPage,
      pageSize,
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
      currentPage: searchState.currentPage,
      pageSize,
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
    // Sort By
    provider.render(SortBy, {})($productSort),

    // Pagination
    provider.render(Pagination, {
      onPageChange: () => {
        // scroll to the top of the page
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    })($pagination),

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
    provider.render(Facets, {})($facets),
    // Product List
    provider.render(SearchResults, {
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

  // Listen for search results (event is fired before the block is rendered; eager: true)
  events.on('search/result', (payload) => {
    const totalCount = payload.result?.totalCount || 0;

    block.classList.toggle('product-list-page--empty', totalCount === 0);

    // Results Info
    $resultInfo.innerHTML = payload.request?.phrase
      ? `${totalCount} results found for <strong>"${payload.request.phrase}"</strong>.`
      : `${totalCount} results found.`;

    // Update the view facets button with the number of filters
    if (payload.request.filter.length > 0) {
      $viewFacets.querySelector('button').setAttribute('data-count', payload.request.filter.length);
    } else {
      $viewFacets.querySelector('button').removeAttribute('data-count');
    }
  }, { eager: true });

  // Listen for search results (event is fired after the block is rendered; eager: false)
  // URL is owned by this project; update it when search state changes.
  events.on('search/result', (payload) => {
    const url = new URL(window.location.href);
    applySearchStateToUrl(url, payload.request);
    window.history.pushState({}, '', url.toString());
  }, { eager: false });
}
