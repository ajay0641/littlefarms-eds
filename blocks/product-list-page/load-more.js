import { search } from '@dropins/storefront-product-discovery/api.js';
import { events } from '@dropins/tools/event-bus.js';
import { Button, provider as UI } from '@dropins/tools/components.js';

/**
 * Build a stable key for sort/filter/phrase changes (resets load-more page).
 *
 * @param {Object} request
 * @return {String}
 */
function getRequestSignature(request) {
  if (!request) return '';
  const filters = (request.filter || []).filter(
    (item) => item.attribute !== 'visibility' && item.attribute !== 'categoryPath',
  );
  return JSON.stringify({
    phrase: request.phrase || '',
    sort: request.sort || [],
    filter: filters,
  });
}

/**
 * Load-more controller for PLP. Fetches additional products by increasing pageSize
 * (page 1) so SearchResults can render the full accumulated list.
 *
 * @param {Object} options
 * @param {HTMLElement} options.container
 * @param {Function} options.getBatchSize Per-page value from the toolbar
 * @param {Number} [options.initialLoadMorePage=1] From URL ?p=
 * @param {Function} [options.onSearchContextChange] Sort/filter changed (reset scroll URL)
 * @param {{loadMore?: String, loading?: String}} [options.labels]
 * @return {Object}
 */
export function createLoadMoreController({
  container,
  getBatchSize,
  initialLoadMorePage = 1,
  onSearchContextChange,
  labels = {},
}) {
  const loadMoreLabel = labels.loadMore || 'Load more products';
  const loadingLabel = labels.loading || 'Loading...';

  let lastRequest = null;
  let lastSignature = '';
  let totalCount = 0;
  let displayedCount = 0;
  let loading = false;
  let pendingLoadMore = false;
  let loadMorePage = Math.max(1, initialLoadMorePage);
  let savedScrollY = 0;
  let scrollAnchor = null;
  let scrollAnchorTop = 0;
  let shouldRestoreScroll = false;
  let navigatedViaLoadMore = false;

  const captureScrollAnchor = () => {
    savedScrollY = window.scrollY;
    const grid = container.closest('.product-list-page')
      ?.querySelector('.product-discovery-product-list__grid');
    const cards = grid?.querySelectorAll('.dropin-product-item-card') ?? [];
    const anchorIndex = Math.max(0, displayedCount - 1);
    scrollAnchor = cards[anchorIndex] ?? null;
    scrollAnchorTop = scrollAnchor?.getBoundingClientRect().top ?? 0;
  };

  const restoreScroll = () => {
    const apply = () => {
      if (scrollAnchor?.isConnected) {
        const nextTop = scrollAnchor.getBoundingClientRect().top;
        const delta = nextTop - scrollAnchorTop;
        if (Math.abs(delta) > 1) {
          window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
        }
      } else if (savedScrollY > 0) {
        window.scrollTo({ top: savedScrollY, left: 0, behavior: 'auto' });
      }
    };

    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  };

  const buttonWrapper = document.createElement('div');
  buttonWrapper.className = 'search__load-more';
  const amountEl = document.createElement('p');
  amountEl.className = 'search__load-more-amount';
  const actionEl = document.createElement('div');
  actionEl.className = 'search__load-more-action';
  buttonWrapper.append(amountEl, actionEl);
  container.append(buttonWrapper);

  /** @type {HTMLButtonElement|null} */
  let buttonEl = null;

  const updateButton = () => {
    const hasProducts = displayedCount > 0;
    const hasMore = hasProducts && displayedCount < totalCount;
    buttonWrapper.hidden = !hasProducts;
    amountEl.textContent = `1 - ${displayedCount} of ${totalCount} products`;
    actionEl.hidden = !hasMore;
    if (!buttonEl) return;
    buttonEl.hidden = !hasMore;
    buttonEl.disabled = loading;
    buttonEl.textContent = loading && pendingLoadMore ? loadingLabel : loadMoreLabel;
  };

  /**
   * @param {Event} [event]
   * @return {Promise<void>}
   */
  const handleLoadMore = async (event) => {
    event?.preventDefault?.();
    if (!lastRequest || loading || displayedCount >= totalCount) return;

    const batchSize = getBatchSize();
    loadMorePage += 1;
    const nextSize = Math.min(batchSize * loadMorePage, totalCount);

    pendingLoadMore = true;
    navigatedViaLoadMore = true;
    shouldRestoreScroll = true;
    loading = true;
    captureScrollAnchor();
    updateButton();

    try {
      await search({
        ...lastRequest,
        pageSize: nextSize,
        currentPage: 1,
      });
    } catch (error) {
      console.error('PLP load more failed', error);
      loadMorePage = Math.max(1, loadMorePage - 1);
      pendingLoadMore = false;
      navigatedViaLoadMore = false;
      loading = false;
      updateButton();
    }
  };

  const renderButton = () => {
    UI.render(Button, {
      variant: 'secondary',
      disabled: loading,
      onClick: handleLoadMore,
      children: loading && pendingLoadMore ? loadingLabel : loadMoreLabel,
    })(actionEl);
    buttonEl = buttonWrapper.querySelector('button');
    buttonEl?.setAttribute('type', 'button');
    updateButton();
  };

  const loadingSub = events.on('search/loading', (isLoading) => {
    loading = isLoading;
    if (!isLoading) {
      pendingLoadMore = false;
    }
    updateButton();
  });

  const resultSub = events.on('search/result', (payload) => {
    const signature = getRequestSignature(payload.request);

    if (!pendingLoadMore && signature !== lastSignature && lastSignature !== '') {
      loadMorePage = 1;
      navigatedViaLoadMore = false;
      onSearchContextChange?.();
    }

    lastSignature = signature;
    lastRequest = payload.request;
    totalCount = payload.result?.totalCount ?? 0;
    displayedCount = payload.result?.items?.length ?? 0;

    if (shouldRestoreScroll) {
      restoreScroll();
      shouldRestoreScroll = false;
    }

    updateButton();
  }, { eager: true });

  renderButton();

  return {
    getLoadMorePage: () => loadMorePage,
    getLastRequest: () => lastRequest,
    consumeLoadMoreNavigation: () => {
      const wasLoadMore = navigatedViaLoadMore;
      navigatedViaLoadMore = false;
      return wasLoadMore;
    },
    reset: () => {
      loadMorePage = 1;
      navigatedViaLoadMore = false;
    },
    destroy: () => {
      loadingSub?.off?.();
      resultSub?.off?.();
    },
  };
}
