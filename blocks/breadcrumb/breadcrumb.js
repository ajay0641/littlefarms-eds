import { Breadcrumbs, provider as UI } from '@dropins/tools/components.js';
import { events } from '@dropins/tools/event-bus.js';
import { h } from '@dropins/tools/preact.js';
import { getMetadata } from '../../scripts/aem.js';
import { getCategoryAncestors } from '../../scripts/menu-data.js';
import {
  getCategoryFromUrl,
  getCategoryLink,
  rootLink,
} from '../../scripts/commerce.js';

/**
 * @returns {boolean}
 */
function isBreadcrumbEnabled() {
  const mode = (getMetadata('breadcrumb') || 'auto').toLowerCase();
  return mode !== 'off' && mode !== 'false' && mode !== 'none';
}

/**
 * @returns {boolean}
 */
function isPdpPage() {
  return /\/?products\/[\w|-]+\/[\w|-]+$/.test(window.location.pathname);
}

/**
 * @returns {boolean}
 */
function isCartPage() {
  return !!document.querySelector('main .commerce-cart')
    || /\/cart\/?$/.test(window.location.pathname);
}

/**
 * @param {object} product
 * @returns {Promise<Array<{ name: string, urlPath: string, id: string }>>}
 */
async function buildPdpCategoryChain(product) {
  const { categories } = product;

  if (categories?.length) {
    const deepest = [...categories].sort((a, b) => b.level - a.level)[0];
    if (deepest?.urlPath) {
      return getCategoryAncestors(deepest.urlPath);
    }
  }

  return [];
}

/**
 * @param {Element} container
 * @param {Array<{ name: string, urlPath: string, id: string }>} categoryChain
 * @param {string|null} currentLabel
 */
function renderBreadcrumbs(container, categoryChain, currentLabel) {
  const items = [h('a', { href: rootLink('/') }, 'Home')];

  categoryChain.forEach(({ name, urlPath, id }, index) => {
    const isLast = index === categoryChain.length - 1 && !currentLabel;
    if (isLast) {
      items.push(h('span', {}, name));
    } else {
      items.push(h('a', { href: getCategoryLink(urlPath, id) }, name));
    }
  });

  if (currentLabel) {
    items.push(h('span', {}, currentLabel));
  }

  UI.render(Breadcrumbs, { categories: items })(container);
}

/**
 * @returns {{ urlPath: string, cateId?: string }|null}
 */
function resolveCategoryMeta() {
  const fromUrl = getCategoryFromUrl();
  if (fromUrl?.urlPath) return fromUrl;

  const plp = document.querySelector('.product-list-page');
  if (plp?.dataset?.urlpath) {
    return {
      urlPath: plp.dataset.urlpath,
      cateId: plp.dataset.categoryId || '',
    };
  }

  return null;
}

export default async function decorate(block) {
  if (!isBreadcrumbEnabled()) {
    block.parentElement?.remove();
    return;
  }

  block.innerHTML = '';
  block.closest('.section')?.classList.add('breadcrumb-container');

  if (isCartPage()) {
    renderBreadcrumbs(block, [], 'Shopping Cart');
    return;
  }

  if (isPdpPage()) {
    events.on('pdp/data', async (product) => {
      if (!product) return;
      const categoryChain = await buildPdpCategoryChain(product);
      renderBreadcrumbs(block, categoryChain, product.name);
    }, { eager: true });
    return;
  }

  renderBreadcrumbs(block, [], null);

  const categoryMeta = resolveCategoryMeta();
  if (!categoryMeta?.urlPath) return;

  getCategoryAncestors(categoryMeta.urlPath)
    .then((ancestors) => {
      if (ancestors.length) {
        renderBreadcrumbs(block, ancestors, null);
        return;
      }
      const leaf = categoryMeta.urlPath.split('/').filter(Boolean).pop();
      renderBreadcrumbs(block, [], leaf || null);
    })
    .catch(() => {
      const leaf = categoryMeta.urlPath.split('/').filter(Boolean).pop();
      renderBreadcrumbs(block, [], leaf || null);
    });
}
