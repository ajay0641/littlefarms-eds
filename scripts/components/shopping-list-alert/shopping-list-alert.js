import { loadCSS } from '../../aem.js';
import { CUSTOMER_LOGIN_PATH, rootLink } from '../../commerce.js';

const ALERT_ID = 'shopping-list-alert';
let stylesLoaded = false;

/**
 * Ensure shopping-list alert styles are loaded once.
 *
 * @return {Promise<void>}
 */
async function ensureStyles() {
  if (stylesLoaded) return;
  stylesLoaded = true;
  await loadCSS(`${window.hlx.codeBasePath}/scripts/components/shopping-list-alert/shopping-list-alert.css`);
}

/**
 * Close and remove the shopping list alert if present.
 *
 * @return {void}
 */
export function closeShoppingListAlert() {
  document.getElementById(ALERT_ID)?.remove();
  document.body.classList.remove('shopping-list-alert-open');
}

/**
 * Open Magento-style guest wishlist / shopping list alert.
 *
 * @param {{
 *   title?: string,
 *   message?: string,
 *   continueLabel?: string,
 *   loginLabel?: string,
 *   onContinue?: () => void,
 *   onLogin?: () => void,
 * }} [options]
 * @return {Promise<void>}
 */
export async function showShoppingListAlert(options = {}) {
  await ensureStyles();

  closeShoppingListAlert();

  const {
    title = 'Shopping List Alert',
    message = 'Please login to your account to add products to your shopping list',
    continueLabel = 'Continue Shopping',
    loginLabel = 'Go to Login',
    onContinue,
    onLogin,
  } = options;

  const overlay = document.createElement('div');
  overlay.id = ALERT_ID;
  overlay.className = 'shopping-list-alert';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'shopping-list-alert-title');

  overlay.innerHTML = `
    <div class="shopping-list-alert__dialog">
      <div class="shopping-list-alert__header">
        <h2 id="shopping-list-alert-title" class="shopping-list-alert__title">${title}</h2>
        <button type="button" class="shopping-list-alert__close" aria-label="Close"></button>
      </div>
      <p class="shopping-list-alert__message">${message}</p>
      <div class="shopping-list-alert__actions">
        <button type="button" class="shopping-list-alert__action shopping-list-alert__action--continue">
          ${continueLabel}
        </button>
        <button type="button" class="shopping-list-alert__action shopping-list-alert__action--login">
          ${loginLabel}
        </button>
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector('.shopping-list-alert__close');
  const continueBtn = overlay.querySelector('.shopping-list-alert__action--continue');
  const loginBtn = overlay.querySelector('.shopping-list-alert__action--login');

  const handleContinue = () => {
    closeShoppingListAlert();
    onContinue?.();
  };

  const handleLogin = () => {
    closeShoppingListAlert();
    if (typeof onLogin === 'function') {
      onLogin();
      return;
    }
    const accountBtn = document.querySelector('.nav-account-button');
    if (accountBtn) {
      accountBtn.click();
      return;
    }
    window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
  };

  closeBtn?.addEventListener('click', handleContinue);
  continueBtn?.addEventListener('click', handleContinue);
  loginBtn?.addEventListener('click', handleLogin);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) handleContinue();
  });

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      handleContinue();
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  document.addEventListener('keydown', onKeyDown);

  document.body.appendChild(overlay);
  document.body.classList.add('shopping-list-alert-open');
  closeBtn?.focus();
}
