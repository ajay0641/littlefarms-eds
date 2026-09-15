import { getCookie } from '@dropins/tools/lib.js';
import * as authApi from '@dropins/storefront-auth/api.js';
import { events } from '@dropins/tools/event-bus.js';
import { rootLink } from '../../scripts/commerce.js';

function handleLogout(redirections) {
  const shouldRedirect = Object.entries(redirections).some(([currentPath, redirectPath]) => {
    if (window.location.pathname.includes(currentPath)) {
      window.location.href = redirectPath;
      return true;
    }
    return false;
  });

  if (!shouldRedirect) {
    // reload the page if no redirect occurred
    window.location.reload();
  }
}

export function renderAuthDropdown(navTools) {
  const accountButton = navTools.querySelector('.nav-account-button');
  const accountPanel = navTools.querySelector('.account-panel');
  if (!accountButton || !accountPanel) return;

  accountPanel.classList.add('nav-auth-menu-panel');
  accountPanel.innerHTML = `
    <ul class="authenticated-user-menu">
      <li><a href="${rootLink('/customer/account')}">My Account</a></li>
      <li><button type="button">Logout</button></li>
    </ul>
  `;
  accountPanel.setAttribute('role', 'dialog');
  accountPanel.setAttribute('aria-label', 'Account menu');
  accountPanel.addEventListener('click', (event) => event.stopPropagation());

  const logoutButton = accountPanel.querySelector('button');
  const toggleAccountMenu = (state) => {
    const show = state ?? !accountPanel.classList.contains('nav-tools-panel--show');
    accountPanel.classList.toggle('nav-tools-panel--show', show);
    accountPanel.setAttribute('aria-hidden', show ? 'false' : 'true');
    accountButton.setAttribute('aria-expanded', show ? 'true' : 'false');
  };

  accountButton.addEventListener('click', () => {
    if (getCookie('auth_dropin_user_token')) toggleAccountMenu();
  });

  document.addEventListener('click', (event) => {
    if (!accountPanel.contains(event.target) && !accountButton.contains(event.target)) {
      toggleAccountMenu(false);
    }
  });

  logoutButton.addEventListener('click', async () => {
    await authApi.revokeCustomerToken();
    handleLogout({
      '/checkout': rootLink('/cart'),
      '/customer': rootLink('/customer/login'),
      '/order-details': rootLink('/'),
    });
  });

  const updateAccountUI = (isAuthenticated) => {
    const userToken = getCookie('auth_dropin_user_token');
    const userName = getCookie('auth_dropin_firstname');

    if (isAuthenticated || userToken) {
      accountButton.classList.add('nav-dropdown-button');
      accountButton.textContent = `Hi, ${userName || ''}`;
      accountButton.setAttribute('aria-label', `Account menu for ${userName || 'customer'}`);
      accountButton.setAttribute('aria-controls', 'account-panel');
    } else {
      accountButton.classList.remove('nav-dropdown-button');
      accountButton.textContent = '';
      accountButton.setAttribute('aria-label', 'Account');
      accountButton.setAttribute('aria-controls', 'auth-combine-modal');
      toggleAccountMenu(false);
    }
  };

  updateAccountUI();
  events.on('authenticated', updateAccountUI);
}
