import { h } from '@dropins/tools/preact.js';
import {
  InLineAlert,
  Icon,
  provider as UI,
} from '@dropins/tools/components.js';
import { loadCSS } from '../../aem.js';

const TOAST_HOST_ID = 'tfs-wishlist-toast';
const TOAST_DURATION_MS = 6000;
let toastTimeout;
let stylesLoaded = false;

/**
 * @returns {HTMLElement}
 */
function getToastHost() {
  let host = document.getElementById(TOAST_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = TOAST_HOST_ID;
    host.className = 'tfs-wishlist-toast';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('role', 'status');
    document.body.appendChild(host);
  }
  return host;
}

async function ensureToastStyles() {
  if (stylesLoaded) return;
  stylesLoaded = true;
  await loadCSS(`${window.hlx.codeBasePath}/scripts/components/tfs-wishlist-toast/tfs-wishlist-toast.css`);
}

/**
 * @param {'success'|'error'|'login'} variant
 * @param {object} options
 * @param {string} options.heading
 * @param {string} [options.description]
 * @param {Array<object>} [options.actions]
 */
export async function showTfsWishlistToast(variant, { heading, description, actions }) {
  await ensureToastStyles();

  const host = getToastHost();
  host.className = `tfs-wishlist-toast tfs-wishlist-toast--${variant}`;
  host.replaceChildren();

  const iconByVariant = {
    success: 'CheckWithCircle',
    login: 'Info',
    error: 'Warning',
  };
  const typeByVariant = {
    success: 'success',
    login: 'warning',
    error: 'error',
  };

  await UI.render(InLineAlert, {
    heading,
    description,
    type: typeByVariant[variant],
    variant: 'primary',
    icon: h(Icon, { source: iconByVariant[variant] }),
    'aria-live': 'assertive',
    role: 'alert',
    additionalActions: actions,
    onDismiss: () => {
      host.replaceChildren();
    },
  })(host);

  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    host.replaceChildren();
  }, TOAST_DURATION_MS);
}

/**
 * @param {'add'|'remove'} action
 * @param {string} productName
 */
export function showWishlistSuccessToast(action, productName) {
  const name = productName || 'Product';
  const heading = action === 'remove' ? 'Removed from wishlist' : 'Added to wishlist';
  const description = action === 'remove'
    ? `${name} has been removed from your wishlist.`
    : `${name} has been added to your wishlist.`;

  return showTfsWishlistToast('success', { heading, description });
}

/**
 * @param {string} [message]
 */
export function showWishlistErrorToast(message) {
  return showTfsWishlistToast('error', {
    heading: 'Wishlist update failed',
    description: message || 'We could not update your wishlist. Please try again.',
  });
}

/**
 * @param {string} productName
 * @param {() => void} [onViewCart]
 */
export function showCartSuccessToast(productName, onViewCart) {
  const name = productName || 'Product';
  const actions = onViewCart
    ? [{
      label: 'View cart',
      onClick: (event) => {
        event.preventDefault();
        onViewCart();
      },
      'aria-label': 'View cart',
    }]
    : undefined;

  return showTfsWishlistToast('success', {
    heading: 'Added to cart',
    description: `${name} has been added to your cart.`,
    actions,
  });
}

/**
 * @param {string} [message]
 */
export function showCartErrorToast(message) {
  return showTfsWishlistToast('error', {
    heading: 'Could not add to cart',
    description: message || 'We could not add this item to your cart. Please try again.',
  });
}

/**
 * @param {() => void} onSignIn
 */
export function showWishlistLoginToast(onSignIn) {
  return showTfsWishlistToast('login', {
    heading: 'Sign in required',
    description: 'Please sign in to save items to your wishlist.',
    actions: [{
      label: 'Sign in',
      onClick: (event) => {
        event.preventDefault();
        onSignIn();
      },
      'aria-label': 'Sign in to use wishlist',
    }],
  });
}
