import { applyCatalogServiceHeaders, CS_FETCH_GRAPHQL } from '../../scripts/commerce.js';

const CATEGORY_TREE_QUERY = `
  query CategoryTree($slugs: [String!]!) {
    categoryTree(slugs: $slugs) {
      slug
      name
      description
      images {
        url
        label
        roles
      }
    }
  }
`;

/** @type {Map<string, Promise<object|null>>} */
const categoryTreeCache = new Map();

/**
 * Leaf slug for categoryTree (urlPath may be nested: parent/child).
 * @param {string} urlPath
 * @returns {string}
 */
export function categorySlugFromUrlPath(urlPath) {
  return String(urlPath || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .pop() || '';
}

/**
 * Prefers BASE role image, otherwise first available.
 * @param {Array<{ url?: string, label?: string, roles?: string[] }>|null|undefined} images
 * @returns {{ url: string, label: string }|null}
 */
function pickCategoryImage(images) {
  if (!Array.isArray(images) || !images.length) return null;
  const withUrl = images.filter((image) => image?.url);
  if (!withUrl.length) return null;
  const base = withUrl.find((image) => image.roles?.includes('BASE'));
  const chosen = base || withUrl[0];
  return {
    url: chosen.url,
    label: chosen.label || '',
  };
}

/**
 * Fetches category name, description, and banner image via Catalog Service.
 * @param {string} urlPath Category urlPath from the PLP URL
 * @returns {Promise<{
 *   slug: string,
 *   name: string|null,
 *   description: string|null,
 *   image: { url: string, label: string }|null
 * }|null>}
 */
export async function fetchCategoryDetails(urlPath) {
  const slug = categorySlugFromUrlPath(urlPath);
  if (!slug) return null;

  if (categoryTreeCache.has(slug)) {
    return categoryTreeCache.get(slug);
  }

  applyCatalogServiceHeaders();

  const promise = CS_FETCH_GRAPHQL.fetchGraphQl(CATEGORY_TREE_QUERY, {
    method: 'POST',
    variables: { slugs: [slug] },
  }).then(({ data, errors }) => {
    if (errors?.length) {
      throw new Error(errors[0].message);
    }
    const category = data?.categoryTree?.[0];
    if (!category) return null;
    return {
      slug: category.slug || slug,
      name: category.name || null,
      description: category.description || null,
      image: pickCategoryImage(category.images),
    };
  }).catch((error) => {
    console.warn('Failed to load category details', error);
    categoryTreeCache.delete(slug);
    return null;
  });

  categoryTreeCache.set(slug, promise);
  return promise;
}
