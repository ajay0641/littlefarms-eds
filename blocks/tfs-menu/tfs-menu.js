import MenuContainer from '@ajay0641/tfs-menu/containers/MenuContainer.js';
import { render as provider } from '@ajay0641/tfs-menu/render.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { CATEGORY_PATH_STORAGE_KEY, getCategoryLink, rootLink } from '../../scripts/commerce.js';
import { fetchMenuCategories, getMenuCategoriesFetcher } from '../../scripts/menu-data.js';

import '../../scripts/initializers/menu.js';

/**
 * Root category from config.json (`plugins.picker.rootCategory`), e.g. "55" for Little Farms.
 * @returns {string}
 */
function getConfiguredRootCategoryId() {
  return String(getConfigValue('plugins.picker.rootCategory') || '2');
}

/**
 * @param {Record<string, string>} config
 * @returns {string}
 */
function getParentId(config) {
  return (
    config['parent-id']
    || config.parentid
    || config.parentId
    || getConfiguredRootCategoryId()
  ).trim();
}

/**
 * @param {import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem[]} categories
 */
function buildCategoryLookup(categories) {
  /** @type {Map<string, import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem>} */
  const lookup = new Map();

  categories.forEach((category) => {
    if (category.urlPath) {
      lookup.set(category.urlPath, category);
    }
    if (category.urlKey) {
      lookup.set(category.urlKey, category);
    }
  });

  return lookup;
}

/**
 * Rewrites menu links from /{urlPath} to /categories/{urlPath}/{categoryId}.
 * @param {Element} block
 * @param {Map<string, import('@ajay0641/tfs-menu/api/menu/menu').CategoryItem>} categoryLookup
 */
function rewriteMenuLinks(block, categoryLookup) {
  block.querySelectorAll('a').forEach((link) => {
    try {
      const url = new URL(link.href, window.location.origin);
      const { pathname } = url;

      if (url.origin !== window.location.origin) return;
      if (pathname === '/' || pathname === '') return;
      if (pathname.startsWith('/categories/')) return;

      const urlPath = pathname.replace(/^\//, '').replace(/\/$/, '');
      if (!urlPath) return;

      const category = categoryLookup.get(urlPath)
        || categoryLookup.get(urlPath.split('/').pop() || '');

      if (category?.urlPath && category.id) {
        link.href = getCategoryLink(category.urlPath, category.id);
      }
    } catch {
      // ignore malformed URLs
    }
  });
}

/**
 * Navigates category links via the PLP template to avoid a 404 round-trip.
 * Href stays canonical for copy/open-in-new-tab once folder mapping is enabled.
 * @param {Element} block
 */
function attachCategoryNavigation(block) {
  block.addEventListener('click', (event) => {
    const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || event.button !== 0 || isModifiedClick) {
      return;
    }

    const link = event.target.closest('a');
    if (!link || !block.contains(link)) return;

    try {
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (!url.pathname.match(/\/categories\/(.+)\/([^/]+)$/)) return;

      event.preventDefault();
      try {
        window.sessionStorage.setItem(CATEGORY_PATH_STORAGE_KEY, url.pathname);
      } catch {
        // fall back to cp param when sessionStorage is unavailable
        const templateUrl = new URL(rootLink('/categories/default'), window.location.href);
        templateUrl.searchParams.set('cp', url.pathname);
        window.location.assign(templateUrl.toString());
        return;
      }
      window.location.assign(rootLink('/categories/default'));
    } catch {
      // ignore malformed URLs
    }
  });
}

/**
 * Fetches categories and rewrites menu links to the storefront PLP URL pattern.
 * @param {Element} block
 * @param {string} parentId
 */
async function rewriteMenuLinksWithCategoryId(block, parentId) {
  try {
    const categories = await fetchMenuCategories(parentId);
    rewriteMenuLinks(block, buildCategoryLookup(categories));
  } catch (error) {
    console.warn('Failed to rewrite menu category links:', error);
  }
}

/**
 * Waits for async menu render, then rewrites category links.
 * @param {Element} block
 * @param {string} parentId
 */
function waitForMenuLinks(block, parentId) {
  return new Promise((resolve) => {
    const rewrite = () => rewriteMenuLinksWithCategoryId(block, parentId)
      .then(resolve)
      .catch(resolve);

    const observer = new MutationObserver(() => {
      if (block.querySelectorAll('a').length > 0) {
        observer.disconnect();
        rewrite();
      }
    });

    observer.observe(block, { childList: true, subtree: true });

    window.setTimeout(() => {
      observer.disconnect();
      rewrite();
    }, 5000);
  });
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const config = readBlockConfig(block);
  const parentId = getParentId(config);

  block.replaceChildren();

  await provider.render(MenuContainer, {
    parentId,
    fetchCategories: getMenuCategoriesFetcher(parentId),
  })(block);

  await waitForMenuLinks(block, parentId);
  attachCategoryNavigation(block);
}
