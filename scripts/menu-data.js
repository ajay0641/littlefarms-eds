import { getConfigValue, getHeaders } from '@dropins/tools/lib/aem/configs.js';
import { applyCatalogServiceHeaders, CS_FETCH_GRAPHQL } from './commerce.js';

const MENU_SESSION_PREFIX = 'hlx-menu-categories-v5';

/**
 * Root category from config.json (`plugins.picker.rootCategory`).
 * Little Farms uses "55"; Magento default catalog root is "2".
 * @returns {string}
 */
function getConfiguredRootCategoryId() {
  return String(getConfigValue('plugins.picker.rootCategory') || '2');
}

/**
 * Store-view scoped cache key so default vs Little Farms menus never collide.
 * @param {string} parentId
 * @returns {string}
 */
function getSessionKey(parentId) {
  let storeView = 'default';
  try {
    storeView = getHeaders('cs')['Magento-Store-View-Code'] || storeView;
  } catch {
    // config may not be ready yet
  }
  return `${MENU_SESSION_PREFIX}:${storeView}:${parentId}`;
}

const GET_MENU_QUERY = `
  query GetMenuCategories(
    $ids: [String!]!
    $roles: [String!]!
    $depth: Int!
    $startLevel: Int!
  ) {
    categories(
      ids: $ids
      roles: $roles
      subtree: {
        depth: $depth
        startLevel: $startLevel
      }
    ) {
      id
      name
      level
      urlPath
      urlKey
      parentId
      position
      children
    }
  }
`;

/** @type {Map<string, Promise<import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]>>} */
const menuCache = new Map();

/** @type {Map<string, () => Promise<import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]>>} */
const menuFetchers = new Map();

/**
 * @param {string} parentId
 * @returns {import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]|null}
 */
function readMenuFromSession(parentId) {
  try {
    // Drop older unscoped / wrong-root caches from prior menu versions
    sessionStorage.removeItem(`hlx-menu-categories:${parentId}`);
    sessionStorage.removeItem(`hlx-menu-categories-v2:${parentId}`);
    sessionStorage.removeItem(`hlx-menu-categories-v3:${parentId}`);
    sessionStorage.removeItem(`hlx-menu-categories-v4:${parentId}`);
    const stored = sessionStorage.getItem(getSessionKey(parentId));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} parentId
 * @param {import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]} categories
 */
function writeMenuToSession(parentId, categories) {
  try {
    sessionStorage.setItem(getSessionKey(parentId), JSON.stringify(categories));
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Reorders the flat category list so MenuContainer preserves sibling order from the API.
 * Catalog Service defines order via each parent's `children` array and `position` field;
 * the flat `categories` array order is not guaranteed.
 * @param {import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]} categories
 * @param {string} rootId
 * @returns {import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]}
 */
function orderCategoriesForMenu(categories, rootId) {
  if (!categories?.length) return [];

  const byId = new Map(categories.map((category) => [String(category.id), category]));
  /** @type {import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]} */
  const ordered = [];
  const visited = new Set();

  /**
   * @param {string} parentId
   */
  function appendChildren(parentId) {
    const parent = byId.get(String(parentId));
    /** @type {string[]} */
    let childIds = [];

    if (parent?.children?.length) {
      childIds = parent.children.map(String);
    } else {
      childIds = categories
        .filter((category) => String(category.parentId) === String(parentId))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((category) => String(category.id));
    }

    childIds.forEach((id) => {
      if (visited.has(id)) return;

      const category = byId.get(id);
      if (!category) return;

      visited.add(id);
      ordered.push(category);
      appendChildren(id);
    });
  }

  appendChildren(rootId);

  categories.forEach((category) => {
    const id = String(category.id);
    if (!visited.has(id)) {
      ordered.push(category);
    }
  });

  return ordered;
}

/**
 * Loads menu categories directly from Catalog Service (API response order).
 * Uses a dedicated query so product blocks on the homepage cannot pollute the menu cache.
 * @param {string} parentId
 * @returns {Promise<import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]>}
 */
async function loadMenuCategoriesFromApi(parentId) {
  await import('./initializers/menu.js');
  applyCatalogServiceHeaders();

  const { data, errors } = await CS_FETCH_GRAPHQL.fetchGraphQl(GET_MENU_QUERY, {
    method: 'POST',
    variables: {
      ids: [parentId],
      roles: ['show_in_menu', 'active'],
      depth: 3,
      startLevel: 1,
    },
  });

  if (errors?.length) {
    throw new Error(errors[0].message);
  }

  return orderCategoriesForMenu(data?.categories || [], parentId);
}

/**
 * Fetches menu categories in API response order and caches for the session.
 * @param {string} [parentId] defaults to `plugins.picker.rootCategory` from config
 * @returns {Promise<import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]>}
 */
export function fetchMenuCategories(parentId = getConfiguredRootCategoryId()) {
  const rootId = String(parentId);
  const cacheKey = getSessionKey(rootId);
  if (menuCache.has(cacheKey)) {
    return menuCache.get(cacheKey);
  }

  const cached = readMenuFromSession(rootId);
  if (cached) {
    const resolved = Promise.resolve(cached);
    menuCache.set(cacheKey, resolved);
    return resolved;
  }

  const promise = loadMenuCategoriesFromApi(rootId).then((categories) => {
    writeMenuToSession(rootId, categories);
    return categories;
  });

  menuCache.set(cacheKey, promise);
  return promise;
}

/**
 * Stable fetchCategories callback for MenuContainer (avoids useEffect re-fetch loops).
 * @param {string} [parentId] defaults to `plugins.picker.rootCategory` from config
 * @returns {() => Promise<import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]>>}
 */
export function getMenuCategoriesFetcher(parentId = getConfiguredRootCategoryId()) {
  const rootId = String(parentId);
  const cacheKey = getSessionKey(rootId);
  if (!menuFetchers.has(cacheKey)) {
    menuFetchers.set(cacheKey, () => fetchMenuCategories(rootId));
  }
  return menuFetchers.get(cacheKey);
}

/**
 * Warms the menu cache after commerce is initialized.
 * Must run before page blocks that issue their own categories queries.
 * @param {string} [parentId] defaults to `plugins.picker.rootCategory` from config
 * @returns {Promise<void>}
 */
export async function prefetchMenuCategories(parentId = getConfiguredRootCategoryId()) {
  await fetchMenuCategories(parentId).catch(() => {});
}

const GET_BREADCRUMB_CATEGORIES_QUERY = `
  query GetBreadcrumbCategories(
    $ids: [String!]!
    $roles: [String!]!
    $depth: Int!
    $startLevel: Int!
  ) {
    categories(
      ids: $ids
      roles: $roles
      subtree: {
        depth: $depth
        startLevel: $startLevel
      }
    ) {
      id
      name
      urlPath
      parentId
    }
  }
`;

const BREADCRUMB_SESSION_PREFIX = 'hlx-breadcrumb-categories-v1';

/** @type {Map<string, Promise<import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]>>} */
const breadcrumbCategoryCache = new Map();

/**
 * @param {string} parentId
 * @returns {import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]|null}
 */
function readBreadcrumbFromSession(parentId) {
  try {
    const stored = sessionStorage.getItem(`${BREADCRUMB_SESSION_PREFIX}:${parentId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} parentId
 * @param {import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]} categories
 */
function writeBreadcrumbToSession(parentId, categories) {
  try {
    sessionStorage.setItem(`${BREADCRUMB_SESSION_PREFIX}:${parentId}`, JSON.stringify(categories));
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Flat category list for breadcrumb ancestor resolution (deeper tree than menu).
 * @param {string} [parentId] defaults to `plugins.picker.rootCategory` from config
 * @returns {Promise<import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]>}
 */
async function fetchBreadcrumbCategories(parentId = getConfiguredRootCategoryId()) {
  const cacheKey = String(parentId);
  if (breadcrumbCategoryCache.has(cacheKey)) {
    return breadcrumbCategoryCache.get(cacheKey);
  }

  const cached = readBreadcrumbFromSession(cacheKey);
  if (cached) {
    const resolved = Promise.resolve(cached);
    breadcrumbCategoryCache.set(cacheKey, resolved);
    return resolved;
  }

  await import('./initializers/menu.js');
  applyCatalogServiceHeaders();

  const promise = CS_FETCH_GRAPHQL.fetchGraphQl(GET_BREADCRUMB_CATEGORIES_QUERY, {
    method: 'POST',
    variables: {
      ids: [cacheKey],
      roles: ['active'],
      depth: 5,
      startLevel: 1,
    },
  }).then(({ data, errors }) => {
    if (errors?.length) {
      throw new Error(errors[0].message);
    }
    const categories = data?.categories || [];
    writeBreadcrumbToSession(cacheKey, categories);
    return categories;
  });

  breadcrumbCategoryCache.set(cacheKey, promise);
  return promise;
}

/**
 * Resolves breadcrumb ancestors for a category urlPath (root → leaf).
 * @param {string} urlPath
 * @param {string} [parentId] defaults to `plugins.picker.rootCategory` from config
 * @returns {Promise<Array<{ name: string, urlPath: string, id: string }>>}
 */
export async function getCategoryAncestors(urlPath, parentId = getConfiguredRootCategoryId()) {
  if (!urlPath) return [];

  const categories = await fetchBreadcrumbCategories(parentId);
  if (!categories.length) return [];

  const byId = new Map(categories.map((category) => [String(category.id), category]));
  const byUrlPath = new Map(
    categories
      .filter((category) => category.urlPath)
      .map((category) => [category.urlPath, category]),
  );

  const target = byUrlPath.get(urlPath);
  if (!target) return [];

  /** @type {Array<{ name: string, urlPath: string, id: string }>} */
  const chain = [];
  let current = target;

  while (current) {
    if (current.urlPath) {
      chain.unshift({
        name: current.name,
        urlPath: current.urlPath,
        id: String(current.id),
      });
    }
    current = current.parentId ? byId.get(String(current.parentId)) : null;
  }

  return chain;
}
