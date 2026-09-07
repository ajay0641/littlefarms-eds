import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import { AuthCombine } from '@dropins/storefront-auth/containers/AuthCombine.js';
import { loadCSS } from './aem.js';

let modalStylesLoaded = false;

async function ensureModalStyles() {
  if (modalStylesLoaded) return;
  modalStylesLoaded = true;
  await loadCSS(`${window.hlx.codeBasePath}/scripts/components/tfs-wishlist-toast/tfs-wishlist-toast.css`);
}

/**
 * Opens the sign-in modal used for wishlist and other gated flows.
 */
export async function showWishlistAuthModal() {
  await ensureModalStyles();

  if (document.getElementById('signin-modal')) return;

  const signInModal = document.createElement('div');
  signInModal.setAttribute('id', 'signin-modal');
  signInModal.classList.add('wishlist-auth-modal');

  const signInForm = document.createElement('div');
  signInForm.setAttribute('id', 'signin-form');

  signInModal.addEventListener('click', (clickEvent) => {
    if (clickEvent.target === signInModal) {
      signInModal.remove();
    }
  });

  signInModal.appendChild(signInForm);
  document.body.appendChild(signInModal);

  authRenderer.render(AuthCombine, {
    signInFormConfig: {
      renderSignUpLink: true,
      onSuccessCallback: () => {
        window.location.reload();
      },
    },
    signUpFormConfig: {
      onSuccessCallback: () => {
        window.location.reload();
      },
    },
    resetPasswordFormConfig: {},
  })(signInForm);
}
