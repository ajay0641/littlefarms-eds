import { rootLink } from './commerce.js';

export const PRODUCT_IMAGE_PLACEHOLDER_PATH = '/images/placeholder.jpg';

/** Default PLP card image size (matches Product Discovery SearchResults defaults). */
export const PLP_IMAGE_DIMENSIONS = {
  width: 400,
  height: 450,
};

/**
 * Local product image placeholder (ACCS admin placeholders are not exposed in Catalog Service).
 * Returns an absolute URL so AEM Assets helpers can parse it safely.
 * @returns {string}
 */
export function getProductImagePlaceholderUrl() {
  const path = rootLink(PRODUCT_IMAGE_PLACEHOLDER_PATH);
  if (/^https?:\/\//.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${window.location.origin}${normalizedPath}`;
}

/**
 * Makes image URLs absolute so `tryRenderAemAssetsImage` can safely call `new URL()`.
 * @param {string} [url]
 * @returns {string}
 */
export function resolveProductImageSrc(url) {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return getProductImagePlaceholderUrl();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `${window.location.protocol}${trimmed}`;
  try {
    return new URL(trimmed, window.location.origin).href;
  } catch {
    return getProductImagePlaceholderUrl();
  }
}

/**
 * @param {object} [product]
 * @returns {{ url: string, label: string }}
 */
export function getPrimaryProductImage(product) {
  const images = product?.images;
  if (Array.isArray(images)) {
    const withUrl = images.find((img) => img?.url?.trim());
    if (withUrl?.url) {
      return {
        url: withUrl.url,
        label: withUrl.label || product?.name || product?.sku || '',
      };
    }
  }

  const cartImageSrc = product?.image?.src?.trim() || product?.image?.url?.trim();
  if (cartImageSrc) {
    return {
      url: cartImageSrc,
      label: product?.image?.alt || product?.name || product?.sku || '',
    };
  }

  return {
    url: getProductImagePlaceholderUrl(),
    label: product?.name || product?.sku || 'Product image placeholder',
  };
}

/**
 * @param {object} [imageProps]
 * @param {object} [product]
 * @returns {object}
 */
export function withProductImageFallback(imageProps, product) {
  const props = imageProps || {};
  const primary = getPrimaryProductImage(product);
  return {
    ...props,
    src: resolveProductImageSrc(props?.src?.trim() || primary.url),
    alt: props?.alt || primary.label,
  };
}
