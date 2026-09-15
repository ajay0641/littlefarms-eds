import { search } from '@dropins/storefront-product-discovery/api.js';
import { events } from '@dropins/tools/event-bus.js';

/**
 * Magento-equivalent labels for Catalog Service sortable attributes.
 * Options are only rendered when the attribute exists on search metadata.
 */
const SORT_MENU = [
  { attribute: 'position', direction: 'DESC', label: 'Recommended' },
  { attribute: 'isNew', direction: 'DESC', label: 'Newest Arrivals' },
  { attribute: 'price', direction: 'ASC', label: 'Price Low to High' },
  { attribute: 'price', direction: 'DESC', label: 'Price High to Low' },
  { attribute: 'name', direction: 'ASC', label: 'Product Name A-Z' },
  { attribute: 'name', direction: 'DESC', label: 'Product Name Z-A' },
];

const DEFAULT_SORT = { attribute: 'position', direction: 'DESC' };

/**
 * @param {Array<{ attribute?: string }>} sortableAttributes
 * @returns {Array<{ attribute: string, direction: string, label: string }>}
 */
function buildSortOptions(sortableAttributes) {
  const available = new Set((sortableAttributes || []).map((item) => item.attribute));
  return SORT_MENU.filter((option) => available.has(option.attribute));
}

/**
 * @param {Array<{ attribute?: string, direction?: string }>} sort
 * @returns {{ attribute: string, direction: string }}
 */
function getCurrentSort(sort) {
  const current = sort?.[0];
  if (!current?.attribute) return DEFAULT_SORT;
  return {
    attribute: current.attribute,
    direction: current.direction === 'ASC' ? 'ASC' : 'DESC',
  };
}

/**
 * @param {{ attribute: string, direction: string }} option
 * @param {{ attribute: string, direction: string }} current
 * @returns {boolean}
 */
function isSelectedOption(option, current) {
  return option.attribute === current.attribute && option.direction === current.direction;
}

/**
 * Renders a Magento-style Sort By dropdown and applies sort via the search API.
 *
 * @param {Element} root Toolbar sort container
 * @param {{getPageSize?: Function}} [options]
 */
export function initSortDropdown(root, { getPageSize } = {}) {
  if (!root) return;

  let lastRequest = {};
  let open = false;

  root.innerHTML = `
    <div class="search__sorter">
      <button type="button" class="search__sorter-trigger" aria-expanded="false" aria-haspopup="listbox">
        <span class="search__sorter-label">Sort By</span>
        <span class="search__sorter-selected"></span>
      </button>
      <ul class="search__sorter-options" role="listbox" hidden></ul>
    </div>
  `;

  const sorter = root.querySelector('.search__sorter');
  const trigger = root.querySelector('.search__sorter-trigger');
  const selectedEl = root.querySelector('.search__sorter-selected');
  const list = root.querySelector('.search__sorter-options');

  /**
   * @param {boolean} nextOpen
   */
  const setOpen = (nextOpen) => {
    open = nextOpen;
    sorter.classList.toggle('is-open', open);
    trigger.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  };

  /**
   * @param {Array<{ attribute: string, direction: string, label: string }>} nextOptions
   * @param {{ attribute: string, direction: string }} current
   */
  const renderOptions = (nextOptions, current) => {
    const selected = nextOptions.find((option) => isSelectedOption(option, current))
      || nextOptions[0];
    selectedEl.textContent = selected?.label || '';

    list.replaceChildren(...nextOptions.map((option) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const isSelected = selected && isSelectedOption(option, selected);
      button.type = 'button';
      button.className = 'search__sorter-option';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(isSelected));
      button.dataset.attribute = option.attribute;
      button.dataset.direction = option.direction;
      button.textContent = option.label;
      if (isSelected) button.classList.add('is-selected');
      item.append(button);
      return item;
    }));
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(!open);
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('.search__sorter-option');
    if (!button || button.classList.contains('is-selected')) return;
    const { attribute, direction: rawDirection } = button.dataset;
    const direction = rawDirection === 'ASC' ? 'ASC' : 'DESC';
    setOpen(false);
    search({
      ...lastRequest,
      sort: [{ attribute, direction }],
      currentPage: 1,
      pageSize: getPageSize?.() ?? lastRequest.pageSize,
    }).catch(() => {
      console.error('Error searching for products');
    });
  });

  document.addEventListener('click', (event) => {
    if (!open) return;
    if (sorter.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) setOpen(false);
  });

  events.on('search/result', (payload) => {
    lastRequest = payload.request || {};
    const current = getCurrentSort(payload.request?.sort);
    renderOptions(
      buildSortOptions(payload.result?.metadata?.sortableAttributes),
      current,
    );
  }, { eager: true });
}
