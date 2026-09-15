/**
 * PLP SearchResults — keeps the product grid visible during load-more (no skeleton swap).
 */
import { jsx as n, jsxs as E } from '@dropins/tools/preact-jsx-runtime.js';
import { useState, useEffect } from '@dropins/tools/preact-compat.js';
import { Slot } from '@dropins/tools/lib.js';
import { events } from '@dropins/tools/event-bus.js';
import { PriceRange, ProductItemCard, Image } from '@dropins/tools/components.js';
import { P as ProductList, S as SearchAlertMessage } from '@dropins/storefront-product-discovery/chunks/components.js';
import {
  s as trackSearchResultsView,
  c as trackCategoryResultsView,
  a as trackProductClick,
  S as POPOVER_SCOPE,
  P as PLP_SCOPE,
} from '@dropins/storefront-product-discovery/api.js';
import { useText } from '@dropins/tools/i18n.js';

/**
 * @param {String} html
 * @return {String}
 */
function decodeHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html').documentElement.textContent;
}

/**
 * @param {{product: Object}} props
 */
function SimplePrice({ product }) {
  let currency = product?.price?.regular?.amount?.currency ?? 'USD';
  if (!Intl.supportedValuesOf('currency').includes(currency)) currency = 'USD';
  const finalValue = product?.price?.final?.amount?.value;
  const regularValue = product?.price?.regular?.amount?.value;
  if (finalValue !== undefined && regularValue !== undefined && finalValue < regularValue) {
    return E('div', {
      class: 'product-price',
      children: [
        n('span', {
          class: 'regular-price-normal',
          children: n(PriceRange, { amount: finalValue, currency }),
        }),
        n('span', {
          class: 'special-price-crossed',
          children: n(PriceRange, { amount: regularValue, currency }),
        }),
      ],
    });
  }
  return n(PriceRange, { amount: regularValue, currency });
}

/**
 * @param {{product: Object}} props
 */
function RangePrice({ product }) {
  let currency = product?.priceRange?.minimum?.regular?.amount?.currency ?? 'USD';
  if (!Intl.supportedValuesOf('currency').includes(currency)) currency = 'USD';
  const minFinal = product?.priceRange?.minimum?.final?.amount?.value;
  const minRegular = product?.priceRange?.minimum?.regular?.amount?.value;
  const maxFinal = product?.priceRange?.maximum?.final?.amount?.value;
  const maxRegular = product?.priceRange?.maximum?.regular?.amount?.value;
  if (minFinal < minRegular || maxFinal < maxRegular) {
    return E('div', {
      class: 'product-price',
      children: [
        n('span', {
          class: 'regular-price-normal',
          children: n(PriceRange, {
            display: 'from to',
            minimumAmount: minFinal,
            maximumAmount: maxFinal,
            currency,
          }),
        }),
        n('span', {
          class: 'special-price-crossed',
          children: n(PriceRange, {
            display: 'from to',
            minimumAmount: minRegular,
            maximumAmount: maxRegular,
            currency,
          }),
        }),
      ],
    });
  }
  return n(PriceRange, {
    display: 'from to',
    minimumAmount: minRegular,
    maximumAmount: maxRegular,
    currency,
  });
}

/**
 * @param {Object} props SearchResults-compatible props
 */
function PlpSearchResults(props) {
  const {
    routeProduct,
    scope,
    slots,
    imageWidth = 255,
    imageHeight = 255,
    skeletonCount = 8,
    onSearchResult,
  } = props;

  const trackScope = scope === 'popover' ? POPOVER_SCOPE : PLP_SCOPE;
  const labels = useText({
    noResults: 'Search.PLP.noResults',
    searchError: 'Search.PLP.searchError',
  });
  const [variables, setVariables] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const offLoading = events.on('search/loading', setLoading, { eager: true, scope });
    const offError = events.on('search/error', () => setError(labels.searchError), {
      eager: true,
      scope,
    });
    const offResult = events.on('search/result', (payload) => {
      setError(payload.result?.items.length < 1 ? labels.noResults : null);
      setVariables(payload.request);
      setProducts(payload.result?.items ?? []);
      onSearchResult?.(payload.result?.items);
      if (payload.request.phrase) {
        trackSearchResultsView(trackScope);
      } else {
        trackCategoryResultsView(trackScope);
      }
    }, { eager: true, scope });

    return () => {
      offLoading?.off?.();
      offError?.off?.();
      offResult?.off?.();
    };
  }, []);

  const onProductClick = (event, product) => {
    const anchor = event.target?.closest?.('a');
    if (!anchor || !routeProduct) return;
    const clicked = new URL(anchor.href);
    const expected = new URL(routeProduct(product), window.location.origin);
    if (clicked.pathname === expected.pathname && clicked.hostname === expected.hostname) {
      trackProductClick(product.sku, trackScope);
    }
  };

  const renderImage = (product, index) => {
    const imageProps = {
      loading: index < 8 ? 'eager' : 'lazy',
      src: product.images?.[0]?.url || '',
      alt: product.images?.[0]?.label || '',
      width: imageWidth,
      height: imageHeight,
      params: { width: imageWidth },
    };
    const label = product.name !== null ? decodeHtml(product.name) : product.sku;
    const image = n(Image, {
      class: 'product-discovery-product-item__image',
      ...imageProps,
      'aria-label': label || '',
    });
    return n(Slot, {
      name: 'ProductImage',
      slot: slots?.ProductImage,
      context: { product, defaultImageProps: imageProps, variables },
      children: routeProduct ? n('a', { href: routeProduct(product), children: image }) : image,
    });
  };

  const renderTitle = (product) => {
    const title = product.name !== null ? decodeHtml(product.name) : '';
    return n(Slot, {
      name: 'ProductName',
      slot: slots?.ProductName,
      context: { product, variables },
      children: routeProduct ? n('a', { href: routeProduct(product), children: title }) : title,
    });
  };

  const renderPrice = (product) => {
    const price = product.typename === 'ComplexProductView'
      ? n(RangePrice, { product })
      : n(SimplePrice, { product });
    return n(Slot, {
      name: 'ProductPrice',
      slot: slots?.ProductPrice,
      context: { product, variables },
      children: routeProduct ? n('a', { href: routeProduct(product), children: price }) : price,
    });
  };

  const renderActions = (product) => n(Slot, {
    name: 'ProductActions',
    slot: slots?.ProductActions,
    context: { product, variables },
  });

  const renderNoResults = () => n(Slot, {
    name: 'NoResults',
    slot: slots?.NoResults,
    context: { error, variables },
    children: error && n(SearchAlertMessage, { alertMessage: error }),
  });

  const renderSkeleton = () => n(ProductList, {
    imageWidth,
    imageHeight,
    productList: Array.from({ length: skeletonCount }, (_, i) => (
      n(ProductItemCard, { initialized: false }, i)
    )),
  });

  const showSkeleton = loading && products.length === 0;
  const isAppending = loading && products.length > 0;

  if (showSkeleton) {
    return n('div', { children: renderSkeleton() });
  }

  if (error && products.length === 0) {
    return n('div', { children: renderNoResults() });
  }

  return n('div', {
    className: isAppending ? 'product-discovery-product-list--appending' : undefined,
    children: n(ProductList, {
      header: n(Slot, {
        name: 'Header',
        slot: slots?.Header,
        context: { products, variables },
      }),
      footer: n(Slot, {
        name: 'Footer',
        slot: slots?.Footer,
        context: { products, variables },
      }),
      imageWidth,
      imageHeight,
      productList: products.map((product, index) => n(ProductItemCard, {
        image: renderImage(product, index),
        titleNode: renderTitle(product),
        price: renderPrice(product),
        actionButton: slots?.ProductActions ? renderActions(product) : undefined,
        onClick: (event) => onProductClick(event, product),
        initialized: true,
      }, product.id || product.sku || index)),
    }),
  });
}

export default PlpSearchResults;
