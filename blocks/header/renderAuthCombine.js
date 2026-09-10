import { getCookie } from '@dropins/tools/lib.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import { SignIn } from '@dropins/storefront-auth/containers/SignIn.js';
import { SignUp } from '@dropins/storefront-auth/containers/SignUp.js';
import { SuccessNotification } from '@dropins/storefront-auth/containers/SuccessNotification.js';
import * as authApi from '@dropins/storefront-auth/api.js';
import { Button, provider as UI } from '@dropins/tools/components.js';
import {
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_FORGOTPASSWORD_PATH,
  rootLink,
} from '../../scripts/commerce.js';

const signInFormConfig = (email) => ({
  initialEmailValue: email,
  formSize: 'small',
  labels: {
    title: 'Welcome back',
    buttonPrimary: 'Log in',
  },
  renderSignUpLink: false,
  routeForgotPassword: () => rootLink(CUSTOMER_FORGOTPASSWORD_PATH),
  slots: {
    Title: (ctx) => {
      const subtitle = document.createElement('p');
      subtitle.className = 'account-auth-subtitle';
      subtitle.textContent = 'Please enter your password to continue';
      ctx.appendChild(subtitle);
    },
    SuccessNotification: (ctx) => {
      const userName = ctx?.isSuccessful?.userName || '';

      const elem = document.createElement('div');

      authRenderer.render(SuccessNotification, {
        labels: {
          headingText: `Welcome ${userName}!`,
          messageText: 'You have successfully logged in.',
        },
        slots: {
          SuccessNotificationActions: (innerCtx) => {
            const primaryBtn = document.createElement('div');

            UI.render(Button, {
              children: 'My Account',

              onClick: () => {
                window.location.href = rootLink(CUSTOMER_ACCOUNT_PATH);
              },
            })(primaryBtn);

            innerCtx.appendChild(primaryBtn);

            const secondaryButton = document.createElement('div');
            secondaryButton.style.display = 'flex';
            secondaryButton.style.justifyContent = 'center';
            secondaryButton.style.marginTop = 'var(--spacing-xsmall)';

            UI.render(Button, {
              children: 'Logout',
              variant: 'tertiary',
              onClick: async () => {
                await authApi.revokeCustomerToken();
                window.location.href = rootLink('/');
              },
            })(secondaryButton);

            innerCtx.appendChild(secondaryButton);
          },
        },
      })(elem);

      ctx.appendChild(elem);
    },
  },
});

const signUpFormConfig = (email) => ({
  inputsDefaultValueSet: [{ code: 'email', defaultValue: email }],
  requireRetypePassword: true,
  formSize: 'small',
  routeSignIn: () => rootLink(CUSTOMER_LOGIN_PATH),
  routeRedirectOnSignIn: () => rootLink(CUSTOMER_ACCOUNT_PATH),
  isAutoSignInEnabled: false,
  slots: {
    SuccessNotification: (ctx) => {
      const elem = document.createElement('div');

      authRenderer.render(SuccessNotification, {
        labels: {
          headingText: 'Your account has been successfully created!',
          messageText: 'You can login using sign-in page now.',
        },
        slots: {
          SuccessNotificationActions: (innerCtx) => {
            const primaryBtn = document.createElement('div');

            UI.render(Button, {
              children: 'Sign in',

              onClick: () => {
                window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
              },
            })(primaryBtn);

            innerCtx.appendChild(primaryBtn);

            const secondaryButton = document.createElement('div');
            secondaryButton.style.display = 'flex';
            secondaryButton.style.justifyContent = 'center';
            secondaryButton.style.marginTop = 'var(--spacing-xsmall)';

            UI.render(Button, {
              children: 'Home',
              variant: 'tertiary',
              onClick: () => {
                window.location.href = rootLink('/');
              },
            })(secondaryButton);

            innerCtx.appendChild(secondaryButton);
          },
        },
      })(elem);

      ctx.appendChild(elem);
    },
  },
});

const getModalOverlay = () => {
  let modalOverlay = document.querySelector('.modal-overlay');
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    document.body.appendChild(modalOverlay);
  }
  return modalOverlay;
};

const bindAccountAuthModal = (accountButton) => {
  const accountWrapper = accountButton?.closest('.account-wrapper');
  const signInModal = accountWrapper?.querySelector('#auth-combine-modal');
  const signInForm = signInModal?.querySelector('#auth-combine-wrapper');
  if (!accountButton || !signInModal || !signInForm) return () => {};

  const modalOverlay = getModalOverlay();
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  let originalViewportContent = viewportMeta?.getAttribute('content');

  function trapFocus(event) {
    const key = event.key.toLowerCase();

    if (key === 'escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    const focusableElements = signInModal.querySelectorAll(
      'input[name="email"], input, button, textarea, select, a[href], [tabindex]:not([tabindex="-1"])',
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (key === 'tab' && event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else if (key === 'tab') {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      } else if (document.activeElement === signInModal) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  function closeModal() {
    if (!signInModal.classList.contains('is-open')) return;

    signInModal.classList.remove('is-open');
    document.documentElement.classList.remove('modal-active');
    if (originalViewportContent) {
      viewportMeta?.setAttribute('content', originalViewportContent);
    }
    window.removeEventListener('keydown', trapFocus);
    accountButton.setAttribute('aria-expanded', 'false');
    accountButton.focus();
  }

  const renderEmailStep = () => {
    signInForm.replaceChildren();

    const reorderLink = document.createElement('a');
    reorderLink.className = 'account-auth-reorder';
    reorderLink.href = rootLink(CUSTOMER_ACCOUNT_PATH);
    reorderLink.textContent = 'Reorder Last Basket';
    signInForm.appendChild(reorderLink);

    const formContainer = document.createElement('div');
    formContainer.className = 'account-auth-form-container';
    signInForm.appendChild(formContainer);

    const renderSignIn = (email) => {
      formContainer.replaceChildren();
      authRenderer.render(SignIn, signInFormConfig(email))(formContainer);
    };

    const renderSignUp = (email) => {
      formContainer.replaceChildren();
      authRenderer.render(SignUp, signUpFormConfig(email))(formContainer);
    };

    const emailStep = document.createElement('div');
    emailStep.className = 'account-auth-email-step';
    emailStep.innerHTML = `
      <h2 id="account-auth-title">Log in / Create account</h2>
      <p id="account-auth-description">Enter your email and we will search if you have an account</p>
      <form class="account-auth-email-form">
        <label for="account-auth-email">Email*</label>
        <input id="account-auth-email" name="email" type="email" autocomplete="email"
          placeholder="Enter your email" aria-describedby="account-auth-description" required>
        <button type="submit" class="account-auth-email-submit">Continue</button>
        <p class="account-auth-error" role="alert" aria-live="polite"></p>
      </form>
    `;
    formContainer.appendChild(emailStep);

    const emailForm = emailStep.querySelector('form');
    const emailInput = emailStep.querySelector('input');
    const submitButton = emailStep.querySelector('button');
    const errorMessage = emailStep.querySelector('.account-auth-error');

    emailForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!emailForm.reportValidity()) return;

      submitButton.disabled = true;
      emailInput.setAttribute('aria-busy', 'true');
      errorMessage.textContent = '';

      try {
        await import('../../scripts/initializers/checkout.js');
        const { isEmailAvailable } = await import('@dropins/storefront-checkout/api.js');
        const email = emailInput.value.trim();
        const emailAvailable = await isEmailAvailable(email);

        if (emailAvailable) {
          renderSignUp(email);
        } else {
          renderSignIn(email);
        }
      } catch (error) {
        console.error('Unable to check customer email', error);
        errorMessage.textContent = 'We could not check your email. Please try again.';
        submitButton.disabled = false;
        emailInput.removeAttribute('aria-busy');
        emailInput.focus();
      }
    });

    requestAnimationFrame(() => emailInput.focus());
  };

  const openModal = () => {
    if (getCookie('auth_dropin_firstname')) {
      window.location.href = rootLink(CUSTOMER_ACCOUNT_PATH);
      return;
    }

    if (signInModal.classList.contains('is-open')) return;

    originalViewportContent = viewportMeta?.getAttribute('content');
    viewportMeta?.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0',
    );

    renderEmailStep();
    signInModal.classList.add('is-open');
    document.documentElement.classList.add('modal-active');
    accountButton.setAttribute('aria-expanded', 'true');
    window.addEventListener('keydown', trapFocus);
  };

  signInForm.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  modalOverlay.addEventListener('click', closeModal);

  return openModal;
};

const renderAuthCombine = (navSections, toggleMenu, accountButton) => {
  const openModal = bindAccountAuthModal(accountButton);

  if (!getCookie('auth_dropin_firstname')) {
    accountButton?.addEventListener('click', openModal);
  }

  const navListEl = navSections?.querySelector('.default-content-wrapper > ul');
  const listItems = navListEl?.querySelectorAll(
    '.default-content-wrapper > ul > li',
  ) || [];

  const accountLi = Array.from(listItems).find((li) => li.textContent.includes('Account'));

  if (accountLi && !getCookie('auth_dropin_firstname')) {
    const accountLiItems = accountLi.querySelectorAll('ul > li');
    const authCombineLink = accountLiItems[accountLiItems.length - 1];

    authCombineLink.classList.add('authCombineNavElement');
    const text = authCombineLink.textContent || '';
    authCombineLink.innerHTML = `<a href="#">${text}</a>`;
    authCombineLink.addEventListener('click', (event) => {
      event.preventDefault();
      openModal();
      toggleMenu?.();
    });
  }
};

export default renderAuthCombine;

