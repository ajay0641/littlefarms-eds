/**
 * Search URL state (query params) for product list / search.
 * All URL reading and writing for search is owned by this project;
 * the storefront-product-discovery dropin does not touch the URL.
 */

/**
 * Parses the sort query param into the search API format.
 * @param {string} [sortParam] - Comma-separated sort spec, e.g. "price_ASC,name_DESC"
 * @returns {{ attribute: string, direction: string }[]} Array of sort clauses
 */
function parseSort(sortParam) {
  if (!sortParam) return [];
  return sortParam.split(',').map((item) => {
    const [attribute, direction] = item.split('_');
    return { attribute, direction };
  });
}

/**
 * Parses the filter query param into the search API format.
 * Supports: single value (attr:val), multiple values (attr:a,b,c), ranges (attr:0-100).
 * @param {string} [filterParam] - Pipe-separated filters, e.g. "color:blue|price:0-100"
 * @returns {Array<{ attribute: string, in?: string[], range?: { from: number, to: number } }>}
 */
function parseFilter(filterParam) {
  if (!filterParam) return [];

  const decodedParam = decodeURIComponent(filterParam);
  const rawFilters = decodedParam.split('|');
  /** @type {Array<{ attribute: string, in?: string[], range?: { from: number, to: number } }>} */
  const results = [];

  rawFilters.forEach((segment) => {
    const colonIdx = segment.indexOf(':');
    if (colonIdx === -1) return;
    const attribute = segment.slice(0, colonIdx).trim();
    const value = segment.slice(colonIdx + 1).trim();
    if (!attribute || !value) return;

    if (value.includes('-')) {
      const [from, to] = value.split('-');
      const fromNum = Number(from);
      const toNum = Number(to);
      if (Number.isFinite(fromNum) && Number.isFinite(toNum)) {
        results.push({
          attribute,
          range: { from: fromNum, to: toNum },
        });
        return;
      }
    }

    const commaRegex = /,(?!\s)/;
    const values = commaRegex.test(value)
      ? value.split(commaRegex).map((s) => s.trim()).filter(Boolean)
      : [value];

    const existing = results.find((r) => r.attribute === attribute && r.in);
    if (existing && existing.in) {
      existing.in.push(...values);
    } else {
      results.push({ attribute, in: values });
    }
  });

  return results;
}

/**
 * Serializes a sort array into the URL query string format.
 * @param {{ attribute: string, direction: string }[]} sort - Sort clauses from search API
 * @returns {string} Comma-separated sort spec, e.g. "price_ASC,name_DESC"
 */
function serializeSort(sort) {
  return sort.map((item) => `${item.attribute}_${item.direction}`).join(',');
}

/**
 * Serializes a filter array into the URL query string format.
 * @param {Array<{ attribute: string, in?: string[], range?: { from: number, to: number } }>} filter
 * @returns {string} Pipe-separated filter spec, or empty string if no filters
 */
function serializeFilter(filter) {
  if (!filter || filter.length === 0) return '';

  return filter.map(({ attribute, in: inValues, range }) => {
    if (inValues) {
      return inValues.map((v) => `${attribute}:${v}`).join('|');
    }
    if (range) {
      return `${attribute}:${range.from}-${range.to}`;
    }
    return null;
  }).filter(Boolean).join('|');
}

/**
 * Reads all search state from the current URL query params.
 * Return shape matches the request object used by applySearchStateToUrl and the search API.
 * @param {URL} url - URL to read from (e.g. new URL(window.location.href))
 * @return {{phrase: String, currentPage: Number, loadMorePage: Number, sort: Array, filter: Array}}
 *   phrase: search query (q param); loadMorePage: virtual load-more page (?p= or legacy ?page=);
 *   sort, filter: parsed for the search API
 */
export function getSearchStateFromUrl(url) {
  const q = url.searchParams.get('q') ?? '';
  const p = url.searchParams.get('p') ?? url.searchParams.get('page');
  const sort = url.searchParams.get('sort');
  const filter = url.searchParams.get('filter');

  const loadMorePage = p ? Math.max(1, Number(p) || 1) : 1;

  return {
    phrase: q,
    currentPage: loadMorePage,
    loadMorePage,
    sort: parseSort(sort),
    filter: parseFilter(filter),
  };
}

/**
 * Writes search state from a request object onto the URL's query params.
 * Call after search/result to keep the URL in sync (e.g. in the search/result event handler).
 * Mutates the URL in place; then use url.toString() or history.pushState to apply.
 * @param {URL} url - URL to update (e.g. new URL(window.location.href))
 * @param {{phrase?: String, sort?: Array, filter?: Array}} request
 *   Search request from the discovery API; only set params are written to the URL.
 * @param {{loadMorePage?: Number}} [options]
 *   loadMorePage: virtual page for load-more (?p=); omit pagination page from URL.
 */
export function applySearchStateToUrl(url, request, { loadMorePage = 1 } = {}) {
  if (request?.phrase) {
    url.searchParams.set('q', request.phrase);
  } else {
    url.searchParams.delete('q');
  }

  url.searchParams.delete('page');

  if (loadMorePage > 1) {
    url.searchParams.set('p', String(loadMorePage));
  } else {
    url.searchParams.delete('p');
  }

  if (request?.sort != null) {
    url.searchParams.set('sort', serializeSort(request.sort));
  }
  if (request?.filter != null) {
    // Don't add visibility filter to the URL, since we always add it in product-list-page.js
    const urlFilters = request.filter.filter((f) => f.attribute !== 'visibility');
    url.searchParams.set('filter', serializeFilter(urlFilters));
  }
}
