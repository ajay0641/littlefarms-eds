import { SignIn } from '@dropins/storefront-auth/containers/SignIn.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_FORGOTPASSWORD_PATH,
  CUSTOMER_PATH,
  checkIsAuthenticated,
  fetchPlaceholders,
  rootLink,
} from '../../scripts/commerce.js';

// Initialize
import '../../scripts/initializers/auth.js';

const CUSTOMER_CREATE_ACCOUNT_PATH = `${CUSTOMER_PATH}/create`;

/**
 * Reads a nested placeholder value (e.g. "Login.registered.title") with a
 * fallback, from the account placeholders sheet.
 * @param {object} placeholders placeholders object
 * @param {string} path dot-separated key path
 * @param {string} fallback default text
 * @returns {string}
 */
function ph(placeholders, path, fallback) {
  const value = path
    .split('.')
    .reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), placeholders);
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * loads and decorates the customer login page (two-column: registered / new)
 * @param {Element} block The commerce-login block element
 */
export default async function decorate(block) {
  if (checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_ACCOUNT_PATH);
    return;
  }

  const placeholders = await fetchPlaceholders('placeholders/account.json');

  block.textContent = '';

  // Page heading
  const pageTitle = document.createElement('h1');
  pageTitle.className = 'commerce-login__title';
  pageTitle.textContent = ph(placeholders, 'Login.pageTitle', 'Customer Login');

  // Two-column grid
  const grid = document.createElement('div');
  grid.className = 'commerce-login__grid';

  // --- Left column: Registered Customers ---
  const registered = document.createElement('div');
  registered.className = 'commerce-login__col commerce-login__registered';

  const regHeading = document.createElement('h2');
  regHeading.className = 'commerce-login__col-title';
  regHeading.textContent = ph(placeholders, 'Login.registered.title', 'Registered Customers');

  const regIntro = document.createElement('div');
  regIntro.className = 'commerce-login__intro';
  const forgotHref = rootLink(CUSTOMER_FORGOTPASSWORD_PATH);
  const lead = ph(placeholders, 'Login.registered.activateLead', 'Are you an existing member? Activate your online account now and');
  const link = ph(placeholders, 'Login.registered.activateLink', 'click here to set a new password.');
  const note = ph(placeholders, 'Login.registered.resetNote', 'If you’ve already reset your password, sign in with your email address below:');
  regIntro.innerHTML = `
    <p class="commerce-login__intro-lead">${lead} <a href="${forgotHref}">${link}</a></p>
    <p class="commerce-login__intro-note">${note}</p>
  `;

  const signInMount = document.createElement('div');
  signInMount.className = 'commerce-login__form';

  const requiredNote = document.createElement('p');
  requiredNote.className = 'commerce-login__required';
  requiredNote.textContent = ph(placeholders, 'Login.registered.requiredFields', '* Required Fields');

  registered.append(regHeading, regIntro, signInMount, requiredNote);

  // --- Right column: New Customers ---
  const newCustomer = document.createElement('div');
  newCustomer.className = 'commerce-login__col commerce-login__new';

  const newHeading = document.createElement('h2');
  newHeading.className = 'commerce-login__col-title';
  newHeading.textContent = ph(placeholders, 'Login.new.title', 'New Customers');

  const newText = document.createElement('p');
  newText.className = 'commerce-login__new-text';
  newText.textContent = ph(placeholders, 'Login.new.description', 'Creating an account has many benefits: check out faster, keep more than one address, track orders and more.');

  const createBtn = document.createElement('a');
  createBtn.className = 'commerce-login__create-btn';
  createBtn.href = rootLink(CUSTOMER_CREATE_ACCOUNT_PATH);
  createBtn.textContent = ph(placeholders, 'Login.new.createButton', 'Create an Account');

  newCustomer.append(newHeading, newText, createBtn);

  grid.append(registered, newCustomer);
  block.append(pageTitle, grid);

  // Render the drop-in SignIn form into the left column (no Remember Me — the
  // drop-in form does not render one).
  await authRenderer.render(SignIn, {
    routeForgotPassword: () => rootLink(CUSTOMER_FORGOTPASSWORD_PATH),
    routeRedirectOnSignIn: () => rootLink(CUSTOMER_ACCOUNT_PATH),
  })(signInMount);
}
