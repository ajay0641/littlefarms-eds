import { loadCSS } from '../../aem.js';

const MODAL_ID = 'cart-remove-confirm-modal';
let stylesLoaded = false;

/**
 * Ensure modal styles are loaded.
 * @returns {Promise<void>}
 */
async function ensureStyles() {
  if (stylesLoaded) return;
  stylesLoaded = true;
  await loadCSS(`${window.hlx.codeBasePath}/scripts/components/cart-confirm-modal/cart-confirm-modal.css`);
}

/**
 * Close and remove any active cart remove confirm modal.
 */
export function closeRemoveCartItemConfirmModal() {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.remove();
  }
  setTimeout(() => {
    document.body.classList.remove('cart-remove-modal-open');
  }, 100);
}

/**
 * Show confirmation modal when removing or decrementing a cart item at qty 1.
 *
 * @param {Object} options
 * @param {string} [options.message]
 * @param {string} [options.cancelLabel]
 * @param {string} [options.okLabel]
 * @param {() => void} [options.onConfirm]
 * @param {() => void} [options.onCancel]
 * @returns {Promise<HTMLElement>}
 */
export async function showRemoveCartItemConfirmModal(options = {}) {
  await ensureStyles();

  closeRemoveCartItemConfirmModal();

  const {
    message = 'Are you sure you want to remove this item from your cart?',
    cancelLabel = 'Cancel',
    okLabel = 'OK',
    onConfirm,
    onCancel,
  } = options;

  const backdrop = document.createElement('div');
  backdrop.id = MODAL_ID;
  backdrop.className = 'cart-remove-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'cart-remove-modal-msg');

  backdrop.innerHTML = `
    <div class="cart-remove-modal">
      <button type="button" class="cart-remove-modal__close" aria-label="Close modal">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="13" y2="13"></line>
          <line x1="13" y1="1" x2="1" y2="13"></line>
        </svg>
      </button>
      <div class="cart-remove-modal__content">
        <p id="cart-remove-modal-msg" class="cart-remove-modal__message">${message}</p>
        <div class="cart-remove-modal__actions">
          <button type="button" class="cart-remove-modal__btn cart-remove-modal__btn--cancel">${cancelLabel}</button>
          <button type="button" class="cart-remove-modal__btn cart-remove-modal__btn--ok">${okLabel}</button>
        </div>
      </div>
    </div>
  `;

  const modalBox = backdrop.querySelector('.cart-remove-modal');
  const closeBtn = backdrop.querySelector('.cart-remove-modal__close');
  const cancelBtn = backdrop.querySelector('.cart-remove-modal__btn--cancel');
  const okBtn = backdrop.querySelector('.cart-remove-modal__btn--ok');

  modalBox.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  const handleDismiss = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    closeRemoveCartItemConfirmModal();
    if (typeof onCancel === 'function') {
      onCancel();
    }
  };

  const handleConfirm = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    closeRemoveCartItemConfirmModal();
    if (typeof onConfirm === 'function') {
      onConfirm();
    }
  };

  closeBtn.addEventListener('click', handleDismiss);
  cancelBtn.addEventListener('click', handleDismiss);
  okBtn.addEventListener('click', handleConfirm);

  // Close when clicking outside modal box
  backdrop.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === backdrop) {
      handleDismiss(e);
    }
  });

  // Handle ESC key
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', handleKeyDown);
      handleDismiss();
    }
  };
  document.addEventListener('keydown', handleKeyDown);

  document.body.classList.add('cart-remove-modal-open');
  document.body.appendChild(backdrop);

  // Focus the Cancel button by default
  cancelBtn.focus();

  return backdrop;
}
