// Drop-in Tools
import { events } from '@dropins/tools/event-bus.js';

import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { fetchPlaceholders, getProductLink, rootLink } from '../../scripts/commerce.js';
import { PLP_IMAGE_DIMENSIONS, withProductImageFallback } from '../../scripts/product-image.js';

import renderAuthCombine from './renderAuthCombine.js';
import { renderAuthDropdown } from './renderAuthDropdown.js';
import renderSellerAssistedBuyingBanner from './renderSellerAssistedBuyingBanner.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 768px)');

const labels = await fetchPlaceholders();

const overlay = document.createElement('div');
overlay.classList.add('overlay');
document.querySelector('header').insertAdjacentElement('afterbegin', overlay);

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.nav-sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      toggleAllNavSections(navSections);
      overlay.classList.remove('show');
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      toggleMenu(nav, navSections);
      overlay.classList.remove('show');
      nav.querySelector('button').focus();
      const navWrapper = document.querySelector('.nav-wrapper');
      navWrapper.classList.remove('active');
    }
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (!nav.contains(e.relatedTarget)) {
    const navSections = nav.querySelector('.nav-sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      toggleAllNavSections(navSections, false);
      overlay.classList.remove('show');
    } else if (!isDesktop.matches) {
      toggleMenu(nav, navSections, true);
    }
  }
}

function openOnKeydown(e) {
  const focused = document.activeElement;
  const isNavDrop = focused.className === 'nav-drop';
  if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
    const dropExpanded = focused.getAttribute('aria-expanded') === 'true';
    toggleAllNavSections(focused.closest('.nav-sections'));
    focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
  }
}

function focusNavSection() {
  document.activeElement.addEventListener('keydown', openOnKeydown);
}

/**
 * Toggles all nav sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleAllNavSections(sections, expanded = false) {
  if (!sections) return;
  sections
    .querySelectorAll('.nav-sections .default-content-wrapper > ul > li')
    .forEach((section) => {
      section.setAttribute('aria-expanded', expanded);
    });
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  document.body.style.overflowY = expanded || isDesktop.matches ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
  button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  // enable nav dropdown keyboard accessibility
  if (navSections) {
    const navDrops = navSections.querySelectorAll('.nav-drop');
    if (isDesktop.matches) {
      navDrops.forEach((drop) => {
        if (!drop.hasAttribute('tabindex')) {
          drop.setAttribute('tabindex', 0);
          drop.addEventListener('focus', focusNavSection);
        }
      });
    } else {
      navDrops.forEach((drop) => {
        drop.classList.remove('active');
        drop.removeAttribute('tabindex');
        drop.removeEventListener('focus', focusNavSection);
      });
    }
  }

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    // collapse menu on escape press
    window.addEventListener('keydown', closeOnEscape);
    // collapse menu on focus lost
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  // Render a banner at the top of the page if seller assisted buying session identified
  const sellerAssistedBuyingBanner = await renderSellerAssistedBuyingBanner();
  if (sellerAssistedBuyingBanner && !document.querySelector('.seller-assisted-buying-banner')) {
    document.body.insertAdjacentElement('afterbegin', sellerAssistedBuyingBanner);
  }

  // load nav as fragment
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  // decorate nav DOM
  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  // Minimal header (e.g. checkout): the authored nav fragment holds just the
  // brand/logo with no navigation lists. The full-nav decoration below assumes
  // brand/sections/tools rows and would crash on the missing pieces, so render
  // a simple centered brand-only header and stop here. A full nav always has
  // link lists (<ul>); the minimal checkout nav does not.
  const hasNavLists = nav.querySelector('ul');
  if (!hasNavLists) {
    nav.classList.add('nav-minimal');
    // The first non-empty section carries the brand/logo.
    const brandSection = [...nav.children].find((c) => c.textContent.trim() || c.querySelector('img, picture'));
    if (brandSection) brandSection.classList.add('nav-brand');
    // Drop empty authored sections.
    [...nav.children].forEach((c) => {
      if (c !== brandSection && !c.textContent.trim() && !c.querySelector('img, picture')) c.remove();
    });
    const navWrapperMinimal = document.createElement('div');
    navWrapperMinimal.className = 'nav-wrapper nav-wrapper-minimal';
    navWrapperMinimal.append(nav);
    block.append(navWrapperMinimal);
    return;
  }

  // The nav doc now authors a notification carousel as the first row, ahead
  // of brand/sections/tools, so every section shifts down by one — the
  // mapping below must include it or brand/sections/tools all get mislabeled.
  const classes = ['notification', 'brand', 'sections', 'tools'];
  classes.forEach((c, i) => {
    const section = nav.children[i];
    if (section) section.classList.add(`nav-${c}`);
  });

  // Notification carousel renders full-width above everything else, so pull
  // it out of the nav row entirely; it's re-inserted at the top of
  // nav-wrapper further down.
  const navNotification = nav.querySelector('.nav-notification');

  const navBrand = nav.querySelector('.nav-brand');
  const brandLink = navBrand.querySelector('.button');
  if (brandLink) {
    brandLink.className = '';
    brandLink.closest('.button-container').className = '';
  }

  /** Search */
  const searchFragment = document.createRange().createContextualFragment(`
  <div class="search-wrapper">
    <button type="button" class="nav-search-button" aria-label="Search"></button>
    <div class="nav-search-input nav-search-panel">
      <form id="search-bar-form"></form>
      <div class="search-bar-result" style="display: none;"></div>
    </div>
    <button type="button" class="nav-search-clear" aria-label="Clear search"></button>
  </div>
  `);

  navBrand.after(searchFragment);

  const navSections = nav.querySelector('.nav-sections');

  const navTools = nav.querySelector('.nav-tools');

  // Static links (On Promo, Housebrand, Store Locations, etc.) are authored
  // inside nav-tools, but visually they belong on the bottom row next to the
  // menu, not on the top row next to account/cart. Pull it out here so it
  // can be regrouped with nav-sections below.
  const navStaticLinks = navTools.querySelector('.nav-static-links');

  /** Static Nav Links */
  const customerMenuFragment = document.createRange().createContextualFragment(`
     <div class="account-wrapper nav-tools-wrapper">
       <button type="button" class="nav-account-button" aria-label="account" aria-haspopup="dialog" aria-expanded="false" aria-controls="auth-combine-modal"></button>
       <div id="auth-combine-modal" role="dialog" aria-modal="true" aria-label="Account access">
         <div id="auth-combine-wrapper"></div>
       </div>
       <div class="account-panel nav-tools-panel" id="account-panel"></div>
     </div>
  `);

  navTools.append(customerMenuFragment);

  const searchWrapper = nav.querySelector('.search-wrapper');
  const searchPanel = nav.querySelector('.nav-search-panel');
  const searchButton = nav.querySelector('.nav-search-button');
  const searchClearButton = searchWrapper.querySelector('.nav-search-clear');
  const searchForm = searchPanel.querySelector('#search-bar-form');
  const searchResult = searchPanel.querySelector('.search-bar-result');

  async function toggleSearch() {
    const pageSize = 4;

    await withLoadingState(searchPanel, searchButton, async () => {
      await import('../../scripts/initializers/search.js');

      // Load search components in parallel
      const [
        { search },
        { render },
        { SearchResults },
        { provider: UI, Input, Button },
      ] = await Promise.all([
        import('@dropins/storefront-product-discovery/api.js'),
        import('@dropins/storefront-product-discovery/render.js'),
        import('@dropins/storefront-product-discovery/containers/SearchResults.js'),
        import('@dropins/tools/components.js'),
        import('@dropins/tools/lib.js'),
      ]);

      render.render(SearchResults, {
        skeletonCount: pageSize,
        scope: 'popover',
        routeProduct: ({ urlKey, sku }) => getProductLink(urlKey, sku),
        onSearchResult: (results) => {
          searchResult.style.display = results.length > 0 ? 'block' : 'none';
        },
        slots: {
          ProductImage: (ctx) => {
            const { product, defaultImageProps } = ctx;
            const width = Number(defaultImageProps?.width) || PLP_IMAGE_DIMENSIONS.width;
            const height = Number(defaultImageProps?.height) || PLP_IMAGE_DIMENSIONS.height;
            const anchorWrapper = document.createElement('a');
            anchorWrapper.href = getProductLink(product.urlKey, product.sku);

            const imageProps = withProductImageFallback(defaultImageProps, product);

            tryRenderAemAssetsImage(ctx, {
              alias: product.sku,
              imageProps: {
                ...imageProps,
                width,
                height,
                params: { ...imageProps.params, width, height },
              },
              wrapper: anchorWrapper,
              params: { width, height },
            });
          },
          Footer: async (ctx) => {
            // View all results button
            const viewAllResultsWrapper = document.createElement('div');

            const viewAllResultsButton = await UI.render(Button, {
              children: labels.Global?.SearchViewAll,
              variant: 'secondary',
              href: rootLink('/search'),
            })(viewAllResultsWrapper);

            ctx.appendChild(viewAllResultsWrapper);

            ctx.onChange((next) => {
              viewAllResultsButton?.setProps((prev) => ({
                ...prev,
                href: `${rootLink('/search')}?q=${encodeURIComponent(next.variables?.phrase || '')}`,
              }));
            });
          },
        },
      })(searchResult);

      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = searchForm.querySelector('input');
        const query = input?.value?.trim() || '';
        if (query.length) {
          window.location.href = `${rootLink('/search')}?q=${encodeURIComponent(query)}`;
        }
      });

      searchForm.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchResult.style.display = 'none';
        }
      });

      const getSearchPlaceholder = () => (isDesktop.matches
        ? (labels.Global?.SearchPlaceholder)
        : (labels.Global?.SearchPlaceholderMobile));

      const syncClearButton = (val) => {
        const text = typeof val === 'string' ? val : (searchForm.querySelector('input')?.value || '');
        if (text.length > 0) {
          searchClearButton?.classList.add('nav-search-clear--show');
        } else {
          searchClearButton?.classList.remove('nav-search-clear--show');
        }
      };

      searchForm.addEventListener('input', (e) => {
        syncClearButton(e.target?.value);
      });

      searchClearButton?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const inputElem = searchForm.querySelector('input');
        if (inputElem) {
          inputElem.value = '';
          inputElem.dispatchEvent(new Event('input', { bubbles: true }));
          inputElem.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncClearButton('');
        search(null, { scope: 'popover' });
        searchResult.style.display = 'none';
        if (inputElem) {
          inputElem.focus();
        }
      });

      await UI.render(Input, {
        name: 'search',
        placeholder: getSearchPlaceholder(),
        onValue: (phrase) => {
          syncClearButton(phrase);

          if (!phrase) {
            search(null, { scope: 'popover' });
            searchResult.style.display = 'none';
            return;
          }

          if (phrase.length < 3) {
            searchResult.style.display = 'none';
            return;
          }

          search({
            phrase,
            pageSize,
            filter: [
              { attribute: 'visibility', in: ['Search', 'Catalog, Search'] },
            ],
          }, { scope: 'popover' });
        },
      })(searchForm);

      // Pre-fill query if currently on /search?q=...
      const currentQuery = new URLSearchParams(window.location.search).get('q');
      if (currentQuery) {
        const inputElem = searchForm.querySelector('input');
        if (inputElem) {
          inputElem.value = currentQuery;
          syncClearButton(currentQuery);
        }
      }
    });
  }

  // Preload search dropin in the background
  toggleSearch();

  const updatePlaceholder = () => {
    const input = searchForm.querySelector('input');
    if (input && !input.value) {
      input.placeholder = isDesktop.matches
        ? (labels.Global?.SearchPlaceholder)
        : (labels.Global?.SearchPlaceholderMobile);
    }
  };
  isDesktop.addEventListener('change', updatePlaceholder);

  searchButton.addEventListener('click', (e) => {
    e.preventDefault();
    const input = searchForm.querySelector('input');
    const query = input?.value?.trim();
    if (query && query.length > 0) {
      window.location.href = `${rootLink('/search')}?q=${encodeURIComponent(query)}`;
    } else {
      input?.focus();
    }
  });

  if (isDesktop.matches) {
    toggleAllNavSections(navSections);
    overlay.classList.remove('show');
  }

  /** Mini Cart */
  const excludeMiniCartFromPaths = ['/checkout'];

  const minicart = document.createRange().createContextualFragment(`
     <div class="minicart-wrapper nav-tools-wrapper">
       <button type="button" class="nav-cart-button" aria-label="Cart" aria-haspopup="dialog" aria-expanded="false" aria-controls="minicart-panel">
         <span class="nav-cart-icon" aria-hidden="true">
           <svg xmlns="http://www.w3.org/2000/svg" width="22" height="20" viewBox="0 0 22 20" fill="currentColor">
             <path d="M21.9,3.7L21.9,3.7c-0.1-0.2-0.4-0.3-0.6-0.3H8c-0.4,0-0.8,0.3-0.8,0.8C7.2,4.7,7.6,5,8,5 h12.3l-2,7.3H7.8l-3-11.7C4.7,0.2,4.4,0,4,0H0.8C0.3,0,0,0.3,0,0.8s0.3,0.8,0.8,0.8h2.7l3,11.7c0.1,0.3,0.4,0.6,0.7,0.6h11.6 c0.3,0,0.6-0.2,0.7-0.6L22,4.4C22,4.2,22,3.9,21.9,3.7z M9.1,14.9c-1.4,0-2.6,1.1-2.6,2.6c0,1.4,1.1,2.6,2.6,2.6 c1.4,0,2.6-1.1,2.6-2.6c0,0,0,0,0,0C11.7,16,10.5,14.9,9.1,14.9z M9.1,18.4c-0.6,0-1-0.4-1-1c0-0.6,0.4-1,1-1c0.6,0,1,0.4,1,1 C10.1,18,9.7,18.4,9.1,18.4z M16.8,14.9c-1.4,0-2.6,1.2-2.6,2.6s1.2,2.6,2.6,2.6s2.6-1.2,2.6-2.6S18.2,14.9,16.8,14.9z M16.8,18.4 c-0.6,0-1-0.4-1-1c0-0.6,0.4-1,1-1s1,0.4,1,1C17.8,18,17.3,18.4,16.8,18.4z"/>
           </svg>
         </span>
         <span class="nav-cart-total"></span>
       </button>
       <div class="minicart-panel nav-tools-panel" id="minicart-panel"></div>
       <div class="nav-cart-status" role="status" aria-live="polite"></div>
     </div>
   `);

  navTools.append(minicart);

  const minicartPanel = navTools.querySelector('.minicart-panel');
  const cartButton = navTools.querySelector('.nav-cart-button');

  const minicartBackdrop = document.createElement('div');
  minicartBackdrop.className = 'minicart-backdrop';
  document.body.appendChild(minicartBackdrop);

  minicartBackdrop.addEventListener('click', () => {
    toggleMiniCart(false);
  });

  // Close panels when clicking outside
  document.addEventListener('click', (e) => {
    // If a modal or confirmation popup is active or was clicked, do not close mini cart
    if (
      e.target.closest('#cart-remove-confirm-modal')
      || e.target.closest('.cart-remove-modal-backdrop')
      || e.target.closest('.cart-remove-modal')
      || document.body.classList.contains('cart-remove-modal-open')
    ) {
      return;
    }

    // Check if undo is enabled for mini cart
    const miniCartElement = document.querySelector(
      '[data-block-name="commerce-mini-cart"]',
    );
    const undoEnabled = miniCartElement
      && (miniCartElement.textContent?.includes('undo-remove-item')
        || miniCartElement.innerHTML?.includes('undo-remove-item'));

    // For mini cart: if undo is enabled, be more restrictive about when to close
    const shouldCloseMiniCart = undoEnabled
      ? !minicartPanel.contains(e.target)
      && !cartButton.contains(e.target)
      && !e.target.closest('header')
      : !minicartPanel.contains(e.target) && !cartButton.contains(e.target);

    if (shouldCloseMiniCart && minicartPanel.classList.contains('nav-tools-panel--show')) {
      toggleMiniCart(false);
    }

    if (!searchWrapper.contains(e.target)) {
      searchResult.style.display = 'none';
    }
  });

  // Kept mounted at all times so the item count change is reliably
  // announced instead of being missed, since the visual badge is a
  // `data-count` attribute rendered via CSS and isn't announced on its own.
  const cartStatus = navTools.querySelector('.nav-cart-status');

  if (excludeMiniCartFromPaths.includes(window.location.pathname)) {
    cartButton.style.display = 'none';
  }

  /**
   * Handles loading states for navigation panels with state management
   *
   * @param {HTMLElement} panel - The panel element to manage loading state for
   * @param {HTMLElement} button - The button that triggers the panel
   * @param {Function} loader - Async function to execute during loading
   */
  async function withLoadingState(panel, button, loader) {
    if (panel.dataset.loaded === 'true' || panel.dataset.loading === 'true') return;

    button.setAttribute('aria-busy', 'true');
    panel.dataset.loading = 'true';

    try {
      await loader();
      panel.dataset.loaded = 'true';
    } finally {
      panel.dataset.loading = 'false';
      button.removeAttribute('aria-busy');

      // Execute pending toggle if exists
      if (panel.dataset.pendingToggle === 'true') {
        // eslint-disable-next-line no-nested-ternary
        const pendingState = panel.dataset.pendingState === 'true' ? true : (panel.dataset.pendingState === 'false' ? false : undefined);

        // Clear pending flags
        panel.removeAttribute('data-pending-toggle');
        panel.removeAttribute('data-pending-state');

        // Execute the pending toggle
        const show = pendingState ?? !panel.classList.contains('nav-tools-panel--show');
        panel.classList.toggle('nav-tools-panel--show', show);
      }
    }
  }

  function togglePanel(panel, state) {
    // If loading is in progress, queue the toggle action
    if (panel.dataset.loading === 'true') {
      // Store the pending toggle action
      panel.dataset.pendingToggle = 'true';
      panel.dataset.pendingState = state !== undefined ? state.toString() : '';
      return;
    }

    const show = state ?? !panel.classList.contains('nav-tools-panel--show');
    panel.classList.toggle('nav-tools-panel--show', show);
  }

  // Lazy loading for mini cart fragment
  async function loadMiniCartFragment() {
    await withLoadingState(minicartPanel, cartButton, async () => {
      const miniCartMeta = getMetadata('mini-cart');
      const miniCartPath = miniCartMeta ? new URL(miniCartMeta, window.location).pathname : '/mini-cart';
      const miniCartFragment = await loadFragment(miniCartPath);
      minicartPanel.append(miniCartFragment.firstElementChild);
    });
  }

  async function toggleMiniCart(state) {
    if (state) {
      await loadMiniCartFragment();
      const { publishShoppingCartViewEvent } = await import('@dropins/storefront-cart/api.js');
      publishShoppingCartViewEvent();
    }

    togglePanel(minicartPanel, state);
    const isOpen = minicartPanel.classList.contains('nav-tools-panel--show');
    cartButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    minicartBackdrop.classList.toggle('minicart-backdrop--show', isOpen);
    document.body.classList.toggle('minicart-drawer-open', isOpen);
  }

  cartButton.addEventListener('click', (e) => {
    if (window.innerWidth < 768) {
      e.preventDefault();
      window.location.href = rootLink('/cart');
      return;
    }
    toggleMiniCart(!minicartPanel.classList.contains('nav-tools-panel--show'));
  });

  events.on('minicart/close', () => {
    toggleMiniCart(false);
  });

  // Cart Item Counter
  let previousCartQuantity;

  events.on('cart/data', (data) => {
    // preload mini cart fragment if user has a cart
    if (data) loadMiniCartFragment();

    const totalQuantity = data?.totalQuantity ?? 0;
    const cartIcon = cartButton.querySelector('.nav-cart-icon');
    const cartTotal = cartButton.querySelector('.nav-cart-total');

    if (totalQuantity) {
      cartButton.setAttribute('data-count', totalQuantity);
      if (cartIcon) cartIcon.setAttribute('data-count', totalQuantity);
    } else {
      cartButton.removeAttribute('data-count');
      if (cartIcon) cartIcon.removeAttribute('data-count');
    }

    const subtotal = data?.total?.includingTax
      ?? data?.subtotal?.includingTax
      ?? data?.subtotal?.excludingTax;
    if (cartTotal) {
      if (subtotal?.value !== undefined && subtotal?.currency) {
        try {
          cartTotal.textContent = new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: subtotal.currency,
          }).format(subtotal.value);
        } catch {
          cartTotal.textContent = `${subtotal.currency} ${subtotal.value.toFixed(2)}`;
        }
      } else if (subtotal?.value !== undefined && totalQuantity > 0) {
        cartTotal.textContent = `$${subtotal.value.toFixed(2)}`;
      } else {
        cartTotal.textContent = '';
      }
    }

    // Skip the announcement for the initial value on page load so screen
    // reader users aren't told about the cart contents before they've
    // interacted with it; only announce actual changes.
    if (previousCartQuantity !== undefined && previousCartQuantity !== totalQuantity) {
      cartStatus.textContent = totalQuantity
        ? `Cart updated, ${totalQuantity} item${totalQuantity === 1 ? '' : 's'} in cart`
        : 'Cart updated, cart is empty';
    }

    previousCartQuantity = totalQuantity;
  }, { eager: true });

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  // Row 1: notification carousel, full width, above the logo/search/tools row.
  if (navNotification) navWrapper.prepend(navNotification);

  navWrapper.addEventListener('mouseout', (e) => {
    if (isDesktop.matches && !nav.contains(e.relatedTarget)) {
      toggleAllNavSections(navSections);
      overlay.classList.remove('show');
    }
  });
  // Bottom row = menu (nav-sections) + static links, in that order, grouped
  // together so a future dedicated "menu" block can target `.nav-bottom-row`
  // as a single unit. Top row (hamburger/brand/search/tools) is left as-is.
  if (navWrapper && (navSections || navStaticLinks)) {
    const navBottomRow = document.createElement('div');
    navBottomRow.className = 'nav-bottom-row';
    if (navSections) navBottomRow.appendChild(navSections);
    if (navStaticLinks) navBottomRow.appendChild(navStaticLinks);
    navWrapper.appendChild(navBottomRow);
  }

  // Track header top offset for minicart drawer
  const updateHeaderTopOffset = () => {
    const notif = navWrapper ? navWrapper.querySelector('.nav-notification') : null;
    const topHeight = (notif?.offsetHeight || 0) + (nav?.offsetHeight || 0);
    if (topHeight > 0) {
      document.documentElement.style.setProperty('--nav-header-top-offset', `${topHeight}px`);
    }
  };
  updateHeaderTopOffset();

  window.addEventListener('resize', () => {
    updateHeaderTopOffset();
    navWrapper.classList.remove('active');
    overlay.classList.remove('show');
    toggleMenu(nav, navSections, false);
  });

  // hamburger for mobile
  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => {
    navWrapper.classList.toggle('active');
    overlay.classList.toggle('show');
    toggleMenu(nav, navSections);
  });
  nav.prepend(hamburger);
  nav.setAttribute('aria-expanded', 'false');
  // prevent mobile nav behavior on window resize
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  renderAuthCombine(
    navSections,
    () => !isDesktop.matches && toggleMenu(nav, navSections, false),
    navTools.querySelector('.nav-account-button'),
  );
  renderAuthDropdown(navTools);
}
