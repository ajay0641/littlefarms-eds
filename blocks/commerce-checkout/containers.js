/* eslint-disable max-len */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-unused-vars */
/* eslint-disable no-shadow */
/* eslint-disable no-use-before-define */
/* eslint-disable prefer-const */

// Checkout Dropin
import * as checkoutApi from '@dropins/storefront-checkout/api.js';
import BillToShippingAddress from '@dropins/storefront-checkout/containers/BillToShippingAddress.js';
import LoginForm from '@dropins/storefront-checkout/containers/LoginForm.js';
import MergedCartBanner from '@dropins/storefront-checkout/containers/MergedCartBanner.js';
import OutOfStock from '@dropins/storefront-checkout/containers/OutOfStock.js';
import PaymentMethods from '@dropins/storefront-checkout/containers/PaymentMethods.js';
import PlaceOrder from '@dropins/storefront-checkout/containers/PlaceOrder.js';
import ServerError from '@dropins/storefront-checkout/containers/ServerError.js';
import ShippingMethods from '@dropins/storefront-checkout/containers/ShippingMethods.js';
import TermsAndConditions from '@dropins/storefront-checkout/containers/TermsAndConditions.js';
import { render as CheckoutProvider } from '@dropins/storefront-checkout/render.js';

// Auth Dropin
import * as authApi from '@dropins/storefront-auth/api.js';
import AuthCombine from '@dropins/storefront-auth/containers/AuthCombine.js';
import { render as AuthProvider } from '@dropins/storefront-auth/render.js';

// Account Dropin
import Addresses from '@dropins/storefront-account/containers/Addresses.js';
import AddressForm from '@dropins/storefront-account/containers/AddressForm.js';
import { render as AccountProvider } from '@dropins/storefront-account/render.js';

// Cart Dropin
import * as cartApi from '@dropins/storefront-cart/api.js';
import CartSummaryList from '@dropins/storefront-cart/containers/CartSummaryList.js';
import GiftCards from '@dropins/storefront-cart/containers/GiftCards.js';
import GiftOptions from '@dropins/storefront-cart/containers/GiftOptions.js';
import OrderSummary from '@dropins/storefront-cart/containers/OrderSummary.js';
import OrderSummaryLine from '@dropins/storefront-cart/containers/OrderSummaryLine.js';
import { render as CartProvider } from '@dropins/storefront-cart/render.js';

// Payment Services Dropin
import { PaymentMethodCode } from '@dropins/storefront-payment-services/api.js';
import CreditCard from '@dropins/storefront-payment-services/containers/CreditCard.js';
import { render as PaymentServices } from '@dropins/storefront-payment-services/render.js';

// Tools
import {
  Header,
  Price,
  provider as UI,
} from '@dropins/tools/components.js';
import { events } from '@dropins/tools/event-bus.js';
import { h } from '@dropins/tools/preact.js';
import { debounce } from '@dropins/tools/lib.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';

// Checkout Dropin Libs
import {
  estimateShippingCost,
  setAddressOnCart,
  getCartAddress,
  transformCartAddressToFormValues,
} from '@dropins/storefront-checkout/lib/utils.js';

import {
  getCartAddressDisplayContent,
  getCheckoutAddressesSlots,
  showModal,
  swatchImageSlot,
} from './utils.js';

// External dependencies
import {
  authPrivacyPolicyConsentSlot,
  checkIsAuthenticated,
  fetchPlaceholders,
  rootLink,
} from '../../scripts/commerce.js';
import {
  applyRewardPoints,
  getAppliedRewardPoints,
  getCheckoutRewardPoints,
  removeRewardPoints,
  setAppliedRewardPoints,
} from './reward-points.js';

// Constants
import {
  ADDRESS_INPUT_DEBOUNCE_TIME,
  BILLING_ADDRESS_DATA_KEY,
  BILLING_FORM_NAME,
  CHECKOUT_ERROR_CLASS,
  CHECKOUT_HEADER_CLASS,
  DEBOUNCE_TIME,
  LOGIN_FORM_NAME,
  SHIPPING_ADDRESS_DATA_KEY,
  SHIPPING_FORM_NAME,
} from './constants.js';

/**
 * Container IDs for registry management
 * @enum {string}
 */
export const CONTAINERS = Object.freeze({
  // Static containers (rendered in Promise.all)
  MERGED_CART_BANNER: 'mergedCartBanner',
  CHECKOUT_HEADER: 'checkoutHeader',
  SERVER_ERROR: 'serverError',
  OUT_OF_STOCK: 'outOfStock',
  LOGIN_FORM: 'loginForm',
  SHIPPING_ADDRESS_FORM_SKELETON: 'shippingAddressFormSkeleton',
  BILL_TO_SHIPPING_ADDRESS: 'billToShippingAddress',
  SHIPPING_METHODS: 'shippingMethods',
  PAYMENT_METHODS: 'paymentMethods',
  BILLING_ADDRESS_FORM_SKELETON: 'billingAddressFormSkeleton',
  ORDER_SUMMARY: 'orderSummary',
  CART_SUMMARY_LIST: 'cartSummaryList',
  SHIP_SUMMARY: 'shipSummary',
  TERMS_AND_CONDITIONS: 'termsAndConditions',
  PLACE_ORDER_BUTTON: 'placeOrderButton',
  GIFT_OPTIONS: 'giftOptions',
  CUSTOMER_SHIPPING_ADDRESSES: 'customerShippingAddresses',
  CUSTOMER_BILLING_ADDRESSES: 'customerBillingAddresses',

  // Dynamic containers (conditional rendering)
  SHIPPING_ADDRESS_FORM: 'shippingAddressForm',
  BILLING_ADDRESS_FORM: 'billingAddressForm',

  // Slot/Sub-containers (nested within other containers)
  ESTIMATE_SHIPPING: 'estimateShipping',
  CART_COUPONS: 'cartCoupons',
  REWARD_POINTS: 'rewardPoints',
  GIFT_CARDS: 'giftCards',
  CART_GIFT_OPTIONS: 'cartGiftOptions',
});

/**
 * A Map to store the API of rendered containers.
 * The key is a unique string ID, and the value is the containers's API object.
 * (e.g., { setProps: (props) => {...}, remove: () => {...} })
 */
const registry = new Map();

/**
 * Checks if a container with the given ID has been rendered.
 * This is used to prevent multiple instances of the same container from being rendered.
 * @param {string} id - The unique ID of the container to check.
 * @returns {boolean} - Returns true if the container has been rendered, false otherwise.
 */
export const hasContainer = (id) => registry.has(id);

/**
 * Helper to get a container from the registry or render and register it if not present.
 * @async
 * @param {string} id - Unique identifier for the container.
 * @param {Function} renderFn - Async function that renders the container.
 * @returns {Promise<Object>} - The rendered container API.
 */
const renderContainer = async (id, renderFn) => {
  if (registry.has(id)) {
    return registry.get(id);
  }

  try {
    const container = await renderFn();
    registry.set(id, container);
    return container;
  } catch (error) {
    console.error(`Error rendering container ${id}:`, error);
    throw error;
  }
};

/**
 * Unmounts and removes a container from the registry.
 * This function checks if the container is registered, removes it from the DOM,
 * and deletes its reference from the registry.
 * @param {string} id - The unique ID of the container to unmount.
 * @return {void}
 */
export const unmountContainer = (id) => {
  if (!registry.has(id)) {
    return;
  }

  const containerApi = registry.get(id);
  containerApi.remove();
  registry.delete(id);
};

/**
 * Renders the merged cart banner notification for authenticated users
 * @param {HTMLElement} container - DOM element to render the banner in
 * @returns {Promise<Object>} - The rendered merged cart banner component
 */
export const renderMergedCartBanner = async (container) => renderContainer(
  CONTAINERS.MERGED_CART_BANNER,
  async () => CheckoutProvider.render(MergedCartBanner)(container),
);

/**
 * Renders the checkout page header with title and styling
 * @param {HTMLElement} container - DOM element to render the header in
 * @param {string} title - The title to display in the header
 * @returns {Promise<Object>} - The rendered checkout header component
 */
export const renderCheckoutHeader = async (container, title) => renderContainer(
  CONTAINERS.CHECKOUT_HEADER,
  async () => UI.render(Header, {
    className: CHECKOUT_HEADER_CLASS,
    divider: true,
    level: 1,
    size: 'large',
    title,
  })(container),
);

/**
 * Renders server error handling with retry functionality and error state management
 * @param {HTMLElement} container - DOM element to render the error component in
 * @param {HTMLElement} contentElement - Main content element to add error styling to
 * @returns {Promise<Object>} - The rendered server error component
 */
export const renderServerError = async (container, contentElement) => renderContainer(
  CONTAINERS.SERVER_ERROR,
  async () => CheckoutProvider.render(ServerError, {
    autoScroll: true,
    onRetry: (error) => {
      if (error.code === 'PERMISSION_DENIED') {
        document.location.reload();
        return;
      }

      contentElement.classList.remove(CHECKOUT_ERROR_CLASS);
    },
    onServerError: () => {
      contentElement.classList.add(CHECKOUT_ERROR_CLASS);
    },
  })(container),
);

/**
 * Renders out of stock handling with cart navigation and product update options
 * @param {HTMLElement} container - DOM element to render the component in
 * @returns {Promise<Object>} - The rendered out-of-stock component
 */
export const renderOutOfStock = async (container) => renderContainer(
  CONTAINERS.OUT_OF_STOCK,
  async () => CheckoutProvider.render(OutOfStock, {
    routeCart: () => rootLink('/cart'),
    onCartProductsUpdate: (items) => {
      cartApi.updateProductsFromCart(items).catch(console.error);
    },
  })(container),
);

/**
 * Renders the login form for guest checkout with authentication options
 * Uses the existing 'authenticated' event system for decoupled communication
 * @param {HTMLElement} container - DOM element to render the login form in
 * @returns {Promise<Object>} - The rendered login form component
 */
export const renderLoginForm = async (container) => renderContainer(
  CONTAINERS.LOGIN_FORM,
  async () => CheckoutProvider.render(LoginForm, {
    // Magento section title is rendered in the fragment; hide drop-in heading
    displayTitle: false,
    name: LOGIN_FORM_NAME,
    onSignInClick: async (initialEmailValue) => {
      const signInForm = document.createElement('div');

      AuthProvider.render(AuthCombine, {
        signInFormConfig: {
          renderSignUpLink: true,
          initialEmailValue,
          formSize: 'default',
          labels: {
            formTitleText: 'Sign In',
            primaryButtonText: 'Sign In',
          },
          // No onSuccessCallback needed - the 'authenticated' event will be fired automatically
        },
        signUpFormConfig: {
          slots: {
            ...authPrivacyPolicyConsentSlot,
          },
        },
        resetPasswordFormConfig: {},
      })(signInForm);

      await showModal(signInForm);
    },
    onSignOutClick: () => {
      authApi.revokeCustomerToken();
    },
  })(container),
);

/**
 * Renders the shipping address form skeleton (initial placeholder)
 * @param {HTMLElement} container - DOM element to render the form in
 * @returns {Promise<Object>} - The rendered shipping address form skeleton
 */
export const renderShippingAddressFormSkeleton = async (container) => renderContainer(
  CONTAINERS.SHIPPING_ADDRESS_FORM_SKELETON,
  async () => AccountProvider.render(AddressForm, {
    fieldIdPrefix: 'shipping',
    isOpen: true,
    showFormLoader: true,
  })(container),
);

/**
 * Renders the billing address form skeleton (initial placeholder)
 * @param {HTMLElement} container - DOM element to render the form in
 * @returns {Promise<Object>} - The rendered billing address form skeleton
 */
export const renderBillingAddressFormSkeleton = async (container) => renderContainer(
  CONTAINERS.BILLING_ADDRESS_FORM_SKELETON,
  async () => AccountProvider.render(AddressForm, {
    fieldIdPrefix: 'billing',
    isOpen: true,
    showFormLoader: true,
  })(container),
);

/**
 * Renders checkbox to set billing address same as shipping address - original regular checkout functionality
 * @param {HTMLElement} container - DOM element to render the checkbox in
 * @returns {Promise<Object>} - The rendered bill to shipping address component
 */
export const renderBillToShippingAddress = async (container) => renderContainer(
  CONTAINERS.BILL_TO_SHIPPING_ADDRESS,
  async () => {
    const setBillingAddressOnCart = setAddressOnCart({ type: 'billing' });

    return CheckoutProvider.render(BillToShippingAddress, {
      onChange: (checked) => {
        const billingFormValues = events.lastPayload('checkout/addresses/billing');

        if (!checked && billingFormValues) {
          setBillingAddressOnCart(billingFormValues);
        }
      },
    })(container);
  },
);

/**
 * Renders available shipping methods with selection interface
 * @param {HTMLElement} container - DOM element to render shipping methods in
 * @returns {Promise<Object>} - The rendered shipping methods component
 */
export const renderShippingMethods = async (container) => renderContainer(
  CONTAINERS.SHIPPING_METHODS,
  async () => CheckoutProvider.render(ShippingMethods)(container),
);

/**
 * Renders payment methods with credit card integration - original regular checkout functionality
 * @param {HTMLElement} container - DOM element to render payment methods in
 * @param {Object} creditCardFormRef - React-style ref for credit card form
 * @returns {Promise<Object>} - The rendered payment methods component
 */
export const renderPaymentMethods = async (container, creditCardFormRef) => renderContainer(
  CONTAINERS.PAYMENT_METHODS,
  async () => CheckoutProvider.render(PaymentMethods, {
    // Magento LF payment tiles (radio + full-width option row)
    UIComponentType: 'ToggleButton',
    slots: {
      Methods: {
        [PaymentMethodCode.CREDIT_CARD]: {
          render: (ctx) => {
            // Magento LF: section label above hosted credit card fields
            const wrap = document.createElement('div');
            wrap.classList.add('checkout__credit-card');

            const title = document.createElement('h3');
            title.classList.add('checkout__payment-method-label');
            title.textContent = 'Pay by Credit Card';

            const $creditCard = document.createElement('div');
            $creditCard.classList.add('checkout__credit-card-form');

            wrap.appendChild(title);
            wrap.appendChild($creditCard);

            PaymentServices.render(CreditCard, {
              getCartId: () => ctx.cartId,
              creditCardFormRef,
            })($creditCard);

            /**
             * Magento LF: move brand icons into the card number field (right side).
             * @returns {void}
             */
            const placeCardIconsInNumberField = () => {
              const icons = $creditCard.querySelector(
                '.payment-services-credit-card-form__eligible-cards',
              );
              const numberContainer = $creditCard.querySelector(
                '.payment-services-credit-card-form__card-number .credit-card-field__container',
              );
              if (!icons || !numberContainer || numberContainer.contains(icons)) {
                return;
              }
              numberContainer.appendChild(icons);
            };

            placeCardIconsInNumberField();
            const iconObserver = new MutationObserver(placeCardIconsInNumberField);
            iconObserver.observe($creditCard, { childList: true, subtree: true });

            ctx.replaceHTML(wrap);
          },
        },
        [PaymentMethodCode.SMART_BUTTONS]: {
          enabled: false,
        },
        [PaymentMethodCode.APPLE_PAY]: {
          enabled: false,
        },
        [PaymentMethodCode.APM]: {
          enabled: false,
        },
        [PaymentMethodCode.GOOGLE_PAY]: {
          enabled: false,
        },
        [PaymentMethodCode.VAULT]: {
          enabled: false,
        },
        [PaymentMethodCode.FASTLANE]: {
          enabled: false,
        },
      },
    },
  })(container),
);

/**
 * Renders terms and conditions with agreement slots and manual consent mode
 * @param {HTMLElement} container - DOM element to render the terms in
 * @returns {Promise<Object>} - The rendered terms and conditions component
 */
export const renderTermsAndConditions = async (container) => renderContainer(
  CONTAINERS.TERMS_AND_CONDITIONS,
  async () => CheckoutProvider.render(TermsAndConditions, {
    slots: {
      Agreements: (ctx) => {
        ctx.appendAgreement(() => ({
          name: 'default',
          mode: 'manual',
          translationId: 'Checkout.TermsAndConditions.label',
        }));
      },
    },
  })(container),
);

/**
 * Renders Magento-style shipping row for order summary (label, method, price).
 * @param {HTMLElement} ctx - The slot context element
 * @returns {void}
 */
export const renderEstimateShipping = (ctx) => {
  const root = document.createElement('div');
  root.className = 'checkout-summary-shipping';
  root.hidden = true;
  root.innerHTML = `
    <div class="checkout-summary-shipping__main">
      <div class="checkout-summary-shipping__text">
        <span class="checkout-summary-shipping__label">Shipping</span>
        <span class="checkout-summary-shipping__method" hidden></span>
      </div>
      <span class="checkout-summary-shipping__price"></span>
    </div>
  `;

  const methodEl = root.querySelector('.checkout-summary-shipping__method');
  const priceEl = root.querySelector('.checkout-summary-shipping__price');

  const formatMoney = (money) => {
    if (money == null) return '';
    const value = typeof money === 'object' ? money.value : money;
    const currency = (typeof money === 'object' && money.currency) || 'SGD';
    if (value == null || Number.isNaN(Number(value))) return '';
    // Match Adobe drop-in order summary currency formatting (e.g. "SGD 20.00")
    return `${currency}\u00a0${Number(value).toFixed(2)}`;
  };

  const resolveMethod = (payload) => {
    if (!payload) return null;

    // Prefer selected method on checkout/cart shipping address
    const selected = payload.shippingAddresses?.[0]?.selectedShippingMethod
      || payload.addresses?.shipping?.selectedShippingMethod;
    if (selected) return selected;

    // Fallback: shipping/estimate event payload
    if (payload.shippingMethod || payload.availableShippingMethods) {
      const estimated = payload.shippingMethod;
      const match = payload.availableShippingMethods?.find((method) => (
        method.code === estimated?.methodCode
        || method.carrier?.code === estimated?.carrierCode
        || method.value === `${estimated?.carrierCode} - ${estimated?.methodCode}`
      )) || payload.availableShippingMethods?.[0];

      if (!match && !estimated) return null;

      return {
        amount: match?.amountInclTax || match?.amount || estimated?.amountInclTax || estimated?.amount,
        carrier: match?.carrier || { title: estimated?.carrierCode || '' },
        title: match?.title || estimated?.methodCode || '',
      };
    }

    return null;
  };

  const update = (payload) => {
    const method = resolveMethod(payload);
    if (!method?.amount && method?.amount !== 0) {
      // Keep previous value if estimate temporarily clears
      return;
    }

    root.hidden = false;
    const carrierTitle = method.carrier?.title || '';
    const methodTitle = method.title || '';
    const methodLabel = [carrierTitle, methodTitle].filter(Boolean).join(' - ');
    methodEl.textContent = methodLabel;
    methodEl.hidden = !methodLabel;
    priceEl.textContent = formatMoney(method.amount);
  };

  events.on('shipping/estimate', update, { eager: true });
  events.on('checkout/updated', update, { eager: true });
  events.on('checkout/initialized', update, { eager: true });
  events.on('cart/data', update, { eager: true });

  // Seed from latest estimate in case events already fired before this slot mounted
  update(events.lastPayload('shipping/estimate'));
  update(events.lastPayload('checkout/updated') || events.lastPayload('checkout/initialized'));

  ctx.appendChild(root);
};

/**
 * Renders gift cards for order summary slot
 * @param {HTMLElement} ctx - The slot context element
 * @returns {void}
 */
export const renderGiftCards = (ctx) => {
  const giftCards = document.createElement('div');
  CartProvider.render(GiftCards)(giftCards);
  ctx.appendChild(giftCards);
};

/**
 * Reads the first applied coupon code from cart data (Magento allows one at checkout).
 * @param {Object|null|undefined} cart
 * @returns {string}
 */
const getAppliedCouponCode = (cart) => {
  const coupons = cart?.appliedCoupons;
  if (!Array.isArray(coupons) || coupons.length === 0) return '';
  return String(coupons[0]?.code || '').trim();
};

/**
 * Re-emits cached cart data so Order Summary re-runs updateLineItems after loyalty changes.
 * The cart drop-in fragment does not include applied_reward_points.
 * @returns {void}
 */
const refreshOrderSummaryLoyalty = () => {
  const cart = cartApi.getCartDataFromCache()
    || events.lastPayload('cart/data')
    || events.lastPayload('cart/initialized');
  if (cart) events.emit('cart/data', cart);
};

/**
 * Inserts a voucher-style Loyalty Points row after Magento discount lines.
 * @param {Array} lineItems
 * @returns {Array}
 */
const addLoyaltyPointsSummaryLine = (lineItems) => {
  const applied = getAppliedRewardPoints();
  const points = Number(applied?.points || 0);
  const amount = Number(applied?.money?.value);
  if (points <= 0 || Number.isNaN(amount) || amount <= 0) {
    return (lineItems || []).filter((item) => item?.key !== 'loyaltyPoints');
  }

  const currency = applied.money?.currency || 'SGD';
  const withoutLoyalty = (lineItems || []).filter((item) => item?.key !== 'loyaltyPoints');

  return [
    ...withoutLoyalty,
    {
      key: 'loyaltyPoints',
      title: 'Loyalty Points',
      className: 'cart-order-summary__discount',
      sortOrder: 650,
      content: h(OrderSummaryLine, {
        label: 'Loyalty Points',
        price: h(Price, {
          className: 'cart-order-summary__price',
          amount: -amount,
          currency,
          sale: true,
        }),
        classSuffixes: ['discount', 'loyalty'],
        testId: 'summary-loyalty-points',
      }, h('span', { className: 'cart-order-summary__coupon__code' }, `${points} points`)),
    },
  ];
};

/**
 * Renders Magento-style Apply Discount Code accordion under Place Order.
 * Shows the applied code in the input and a Cancel Discount action; blocks a second coupon.
 * @param {HTMLElement} container - DOM element to render coupons in
 * @returns {Promise<Object>} - API with remove()
 */
export const renderCheckoutCoupons = async (container) => renderContainer(
  CONTAINERS.CART_COUPONS,
  async () => {
    if (!container) return null;

    const root = document.createElement('div');
    root.className = 'checkout-discount';
    root.dataset.testid = 'checkout-discount';
    root.innerHTML = `
      <button
        type="button"
        class="checkout-discount__toggle"
        aria-expanded="true"
        aria-controls="checkout-discount-panel"
      >
        <span class="checkout-discount__title">Apply Discount Code</span>
        <span class="checkout-discount__chevron" aria-hidden="true"></span>
      </button>
      <div
        id="checkout-discount-panel"
        class="checkout-discount__panel"
        role="region"
        aria-label="Apply Discount Code"
      >
        <p class="checkout-discount__error" hidden></p>
        <form class="checkout-discount__form" novalidate>
          <label class="checkout-discount__label" for="checkout-discount-code">
            Discount code
          </label>
          <input
            id="checkout-discount-code"
            class="checkout-discount__input"
            type="text"
            name="discount_code"
            maxlength="50"
            autocomplete="off"
            placeholder="Enter discount code"
            aria-label="Enter discount code"
          />
          <button type="submit" class="checkout-discount__action">
            Apply Discount
          </button>
        </form>
      </div>
    `;

    container.replaceChildren(root);

    const toggle = root.querySelector('.checkout-discount__toggle');
    const panel = root.querySelector('.checkout-discount__panel');
    const form = root.querySelector('.checkout-discount__form');
    const input = root.querySelector('.checkout-discount__input');
    const action = root.querySelector('.checkout-discount__action');
    const errorEl = root.querySelector('.checkout-discount__error');

    let appliedCode = '';
    let busy = false;

    const setError = (message = '') => {
      if (!message) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        input?.removeAttribute('aria-invalid');
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = message;
      input?.setAttribute('aria-invalid', 'true');
    };

    const setBusy = (isBusy) => {
      busy = isBusy;
      input.readOnly = Boolean(appliedCode);
      input.disabled = isBusy;
      action.disabled = isBusy;
      root.classList.toggle('checkout-discount--busy', isBusy);
    };

    const syncUi = (code = '') => {
      appliedCode = String(code || '').trim();
      const hasCoupon = Boolean(appliedCode);

      root.classList.toggle('checkout-discount--applied', hasCoupon);

      if (hasCoupon) {
        input.value = appliedCode;
        delete input.dataset.userEdited;
      } else if (!input.dataset.userEdited) {
        input.value = '';
      }

      input.readOnly = hasCoupon;
      if (!busy) input.disabled = false;

      action.textContent = hasCoupon ? 'Cancel Discount' : 'Apply Discount';
      action.setAttribute(
        'aria-label',
        hasCoupon ? 'Cancel discount code' : 'Apply discount code',
      );
    };

    const syncFromCart = (cart) => {
      const code = getAppliedCouponCode(cart);
      if (!code) delete input.dataset.userEdited;
      syncUi(code);
      if (code) setError('');
    };

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      root.classList.toggle('checkout-discount--collapsed', expanded);
    });

    input.addEventListener('input', () => {
      if (appliedCode) return;
      input.dataset.userEdited = 'true';
      setError('');
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;

      setError('');
      setBusy(true);

      try {
        if (appliedCode) {
          const result = await cartApi.applyCouponsToCart(
            [],
            cartApi.ApplyCouponsStrategy.REPLACE,
          );
          if (result === null) throw new Error('Unable to cancel discount code');
          delete input.dataset.userEdited;
          input.value = '';
          syncUi('');
          return;
        }

        const code = input.value.trim();
        if (!code) {
          setError('Please enter a discount code.');
          return;
        }

        // Magento checkout: only one coupon — REPLACE keeps a single code on the cart
        const result = await cartApi.applyCouponsToCart(
          [code],
          cartApi.ApplyCouponsStrategy.REPLACE,
        );
        if (result === null) throw new Error('Unable to apply discount code');

        const nextCode = getAppliedCouponCode(result) || code;
        syncUi(nextCode);
      } catch (error) {
        console.warn('Checkout discount error:', error);
        setError(error?.message || 'Unable to update discount code. Please try again.');
        syncFromCart(cartApi.getCartDataFromCache() || events.lastPayload('cart/data'));
      } finally {
        setBusy(false);
      }
    });

    const onCartData = (cart) => syncFromCart(cart);
    events.on('cart/data', onCartData, { eager: true });
    events.on('cart/updated', onCartData, { eager: true });
    syncFromCart(cartApi.getCartDataFromCache() || events.lastPayload('cart/data'));

    return {
      remove: () => {
        container.replaceChildren();
      },
    };
  },
);

/**
 * Renders reward-points redemption for signed-in customers.
 * Adobe Commerce's mutation applies the maximum eligible points; the input is for
 * shopper intent and client-side validation, not a partial-redemption amount.
 * @param {HTMLElement} container - DOM element to render reward points in
 * @returns {Promise<Object>} API with remove()
 */
export const renderCheckoutRewardPoints = async (container) => renderContainer(
  CONTAINERS.REWARD_POINTS,
  async () => {
    if (!container || !checkIsAuthenticated()) {
      container?.replaceChildren();
      return { remove: () => container?.replaceChildren() };
    }

    const root = document.createElement('div');
    root.className = 'checkout-reward-points';
    root.dataset.testid = 'checkout-reward-points';
    root.hidden = true;
    root.innerHTML = `
      <button
        type="button"
        class="checkout-reward-points__toggle"
        aria-expanded="true"
        aria-controls="checkout-reward-points-panel"
      >
        <span class="checkout-reward-points__title">Apply Loyalty Points</span>
        <span class="checkout-reward-points__chevron" aria-hidden="true"></span>
      </button>
      <div
        id="checkout-reward-points-panel"
        class="checkout-reward-points__panel"
        role="region"
        aria-label="Apply Loyalty Points"
      >
        <p class="checkout-reward-points__balance" id="checkout-reward-points-balance" aria-live="polite"></p>
        <p class="checkout-reward-points__error" id="checkout-reward-points-error" role="alert" hidden></p>
        <p class="checkout-reward-points__hint" id="checkout-reward-points-hint" aria-live="polite" hidden></p>
        <form class="checkout-reward-points__form" novalidate>
          <label class="checkout-reward-points__label" for="checkout-reward-points-value">
            Points to redeem
          </label>
          <input
            id="checkout-reward-points-value"
            class="checkout-reward-points__input"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="9"
            placeholder="Enter points to redeem"
            aria-describedby="checkout-reward-points-balance checkout-reward-points-error checkout-reward-points-hint"
          />
          <button type="submit" class="checkout-reward-points__action">
            Redeem
          </button>
        </form>
      </div>
    `;
    container.replaceChildren(root);

    const toggle = root.querySelector('.checkout-reward-points__toggle');
    const form = root.querySelector('.checkout-reward-points__form');
    const balanceEl = root.querySelector('.checkout-reward-points__balance');
    const errorEl = root.querySelector('.checkout-reward-points__error');
    const hintEl = root.querySelector('.checkout-reward-points__hint');
    const input = root.querySelector('.checkout-reward-points__input');
    const action = root.querySelector('.checkout-reward-points__action');

    let cartId = '';
    let balance = null;
    let applied = null;
    let busy = false;
    let pendingLoad = null;

    const formatMoney = (money) => {
      if (money?.value == null || !money.currency) return '';
      try {
        return new Intl.NumberFormat('en-SG', {
          style: 'currency',
          currency: money.currency,
        }).format(Number(money.value));
      } catch {
        return `${money.currency} ${Number(money.value).toFixed(2)}`;
      }
    };

    const setError = (message = '') => {
      errorEl.textContent = message;
      errorEl.hidden = !message;
      input.setAttribute('aria-invalid', String(Boolean(message)));
    };

    const setHint = (message = '') => {
      hintEl.textContent = message;
      hintEl.hidden = !message;
    };

    const publishAppliedPoints = (nextApplied) => {
      applied = nextApplied;
      setAppliedRewardPoints(nextApplied);
      refreshOrderSummaryLoyalty();
    };

    const syncUi = () => {
      const availablePoints = Number(balance?.points || 0);
      const appliedPoints = Number(applied?.points || 0);
      const hasAppliedPoints = appliedPoints > 0;
      const money = formatMoney(balance?.money);

      root.hidden = false;
      root.classList.toggle('checkout-reward-points--applied', hasAppliedPoints);
      root.classList.toggle('checkout-reward-points--busy', busy);

      balanceEl.textContent = `You have ${availablePoints} loyalty points.${money ? ` That's ${money}!` : ''}`;
      action.textContent = hasAppliedPoints ? 'Cancel Loyalty Points' : 'Redeem';
      input.readOnly = hasAppliedPoints;

      if (hasAppliedPoints) {
        input.value = String(appliedPoints);
        return;
      }

      // Keep the field empty so Magento's placeholder is visible — never "0".
      if (!input.dataset.userEdited) input.value = '';
    };

    const validatePoints = () => {
      const availablePoints = Number(balance?.points || 0);
      const raw = input.value.trim();

      if (!raw) {
        return { error: 'Enter points to redeem.' };
      }
      if (!/^\d+$/.test(raw)) {
        return { error: 'Enter loyalty points as a whole number.' };
      }

      const points = Number(raw);
      if (points <= 0) {
        return { error: 'Enter at least 1 loyalty point.' };
      }
      if (availablePoints <= 0) {
        return { error: 'You do not have any loyalty points to redeem yet.' };
      }
      if (points > availablePoints) {
        return { error: `You only have ${availablePoints} loyalty points available.` };
      }

      return { points };
    };

    const loadState = async () => {
      const cart = cartApi.getCartDataFromCache()
        || events.lastPayload('cart/data')
        || events.lastPayload('cart/initialized');
      cartId = cart?.id || cartId;
      if (!cartId || pendingLoad) return pendingLoad;

      pendingLoad = getCheckoutRewardPoints(cartId)
        .then((state) => {
          ({ balance } = state);
          if (!balance) {
            root.hidden = true;
            publishAppliedPoints(null);
            return;
          }
          publishAppliedPoints(state.applied);
          setError('');
          if (!Number(state.applied?.points || 0)) setHint('');
          syncUi();
        })
        .catch((error) => {
          // A store without the Reward module should not lose the rest of checkout.
          console.warn('Checkout reward points are unavailable:', error);
          root.hidden = true;
        })
        .finally(() => {
          pendingLoad = null;
        });
      return pendingLoad;
    };

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      root.classList.toggle('checkout-reward-points--collapsed', expanded);
    });

    input.addEventListener('input', () => {
      input.dataset.userEdited = 'true';
      if (!errorEl.hidden) setError('');
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !cartId) return;

      const hasAppliedPoints = Number(applied?.points || 0) > 0;

      let requestedPoints = 0;
      if (!hasAppliedPoints) {
        const { error, points } = validatePoints();
        if (error) {
          setError(error);
          input.focus();
          return;
        }
        requestedPoints = points;
      }

      busy = true;
      setError('');
      setHint('');
      syncUi();

      try {
        const updatedCart = hasAppliedPoints
          ? await removeRewardPoints(cartId)
          : await applyRewardPoints(cartId);
        if (!updatedCart) throw new Error('Unable to update loyalty points.');

        publishAppliedPoints(updatedCart.applied_reward_points ?? null);
        if (!applied?.points) {
          delete input.dataset.userEdited;
          setHint('');
        } else if (requestedPoints && requestedPoints !== Number(applied.points)) {
          // Magento GraphQL applies the maximum eligible points, not a partial amount.
          setHint(`The maximum eligible ${applied.points} loyalty points were applied to this order.`);
        }
        syncUi();

        try {
          await cartApi.refreshCart();
        } catch (refreshError) {
          // The mutation succeeded, so keep its state visible even if refreshing the
          // other checkout containers fails. Their next cart event will resynchronize.
          console.warn('Unable to refresh checkout totals:', refreshError);
        }
      } catch (error) {
        console.warn('Checkout reward points error:', error);
        setError(error?.message || 'Unable to update loyalty points. Please try again.');
      } finally {
        busy = false;
        syncUi();
      }
    });

    events.on('cart/initialized', loadState, { eager: true });
    events.on('cart/updated', loadState);
    loadState();

    return {
      remove: () => container.replaceChildren(),
    };
  },
);

/**
 * Renders gift options for cart summary list footer slot
 * @param {HTMLElement} ctx - The slot context element
 * @returns {void}
 */
export const renderCartGiftOptions = (ctx) => {
  const giftOptions = document.createElement('div');

  CartProvider.render(GiftOptions, {
    item: ctx.item,
    view: 'product',
    dataSource: 'cart',
    isEditable: false,
    handleItemsLoading: ctx.handleItemsLoading,
    handleItemsError: ctx.handleItemsError,
    onItemUpdate: ctx.onItemUpdate,
    slots: {
      SwatchImage: swatchImageSlot,
    },
  })(giftOptions);

  ctx.appendChild(giftOptions);
};

// ============================================================================
// SUMMARY CONTAINERS
// ============================================================================

/**
 * Renders order summary with estimate shipping and gift cards slots.
 * Coupons live under Place Order (see renderCheckoutCoupons), matching Magento.
 * @param {HTMLElement} container - DOM element to render order summary in
 * @returns {Promise<Object>} - The rendered order summary component
 */
export const renderOrderSummary = async (container) => renderContainer(
  CONTAINERS.ORDER_SUMMARY,
  async () => CartProvider.render(OrderSummary, {
    enableCoupons: false,
    updateLineItems: addLoyaltyPointsSummaryLine,
    slots: {
      EstimateShipping: renderEstimateShipping,
      GiftCards: renderGiftCards,
    },
  })(container),
);

/**
 * Renders cart summary list with custom heading, thumbnail and gift options slots
 * @param {HTMLElement} container - DOM element to render cart summary list in
 * @returns {Promise<Object>} - The rendered cart summary list component
 */
export const renderCartSummaryList = async (container) => renderContainer(
  CONTAINERS.CART_SUMMARY_LIST,
  async () => CartProvider.render(CartSummaryList, {
    variant: 'secondary',
    slots: {
      Heading: (headingCtx) => {
        const cartSummaryListHeading = document.createElement('div');
        cartSummaryListHeading.classList.add('cart-summary-list__heading');
        cartSummaryListHeading.setAttribute('role', 'button');
        cartSummaryListHeading.setAttribute('tabindex', '0');
        cartSummaryListHeading.setAttribute('aria-expanded', 'true');

        const cartSummaryListHeadingText = document.createElement('div');
        cartSummaryListHeadingText.classList.add(
          'cart-summary-list__heading-text',
        );

        const formatItemsHeading = (count) => {
          const qty = Number(count) || 0;
          return qty === 1 ? '1 Item in Cart' : `${qty} Items in Cart`;
        };

        cartSummaryListHeadingText.innerText = formatItemsHeading(headingCtx.count);

        const chevron = document.createElement('span');
        chevron.classList.add('cart-summary-list__chevron');
        chevron.setAttribute('aria-hidden', 'true');

        cartSummaryListHeading.appendChild(cartSummaryListHeadingText);
        cartSummaryListHeading.appendChild(chevron);
        headingCtx.appendChild(cartSummaryListHeading);

        /**
         * Toggles cart items list open/closed (Magento accordion behavior).
         * @returns {void}
         */
        const toggleCartItems = () => {
          const listRoot = cartSummaryListHeading.closest('.cart-cart-summary-list');
          if (!listRoot) return;

          const isCollapsed = listRoot.classList.toggle('cart-summary-list--collapsed');
          cartSummaryListHeading.setAttribute(
            'aria-expanded',
            isCollapsed ? 'false' : 'true',
          );
        };

        cartSummaryListHeading.addEventListener('click', toggleCartItems);
        cartSummaryListHeading.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleCartItems();
          }
        });

        headingCtx.onChange((nextHeadingCtx) => {
          cartSummaryListHeadingText.innerText = formatItemsHeading(
            nextHeadingCtx.count,
          );
        });
      },
      Thumbnail: (ctx) => {
        const { item, defaultImageProps } = ctx;
        tryRenderAemAssetsImage(ctx, {
          alias: item.sku,
          imageProps: defaultImageProps,

          params: {
            width: defaultImageProps.width,
            height: defaultImageProps.height,
          },
        });
      },
      Footer: renderCartGiftOptions,
    },
  })(container),
);

/**
 * Creates Magento-style edit control that scrolls to a checkout section.
 * @param {string} targetSelector
 * @param {string} label
 * @returns {HTMLButtonElement}
 */
const createShipSummaryEditButton = (targetSelector, label) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'checkout-ship-summary__edit';
  button.setAttribute('aria-label', label);
  button.innerHTML = '<span class="icon icon-edit" aria-hidden="true"></span>';
  button.addEventListener('click', () => {
    const target = document.querySelector(targetSelector);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  return button;
};

/**
 * Renders Magento LF "Ship to" + "Shipping method" blocks under Items in Cart.
 * @param {HTMLElement} container
 * @returns {Promise<Object|null>}
 */
export const renderShipSummary = async (container) => renderContainer(
  CONTAINERS.SHIP_SUMMARY,
  async () => {
    if (!container) return null;

    const root = document.createElement('div');
    root.className = 'checkout-ship-summary';
    root.hidden = true;
    root.innerHTML = `
      <div class="checkout-ship-summary__block checkout-ship-summary__ship-to" hidden>
        <div class="checkout-ship-summary__header">
          <h3 class="checkout-ship-summary__title">Ship to:</h3>
        </div>
        <div class="checkout-ship-summary__body checkout-ship-summary__address"></div>
      </div>
      <div class="checkout-ship-summary__block checkout-ship-summary__method" hidden>
        <div class="checkout-ship-summary__header">
          <h3 class="checkout-ship-summary__title">Shipping method:</h3>
        </div>
        <div class="checkout-ship-summary__body">
          <p class="checkout-ship-summary__method-label"></p>
        </div>
      </div>
    `;

    const shipToBlock = root.querySelector('.checkout-ship-summary__ship-to');
    const methodBlock = root.querySelector('.checkout-ship-summary__method');
    const addressEl = root.querySelector('.checkout-ship-summary__address');
    const methodLabelEl = root.querySelector('.checkout-ship-summary__method-label');
    const shipToHeader = shipToBlock.querySelector('.checkout-ship-summary__header');
    const methodHeader = methodBlock.querySelector('.checkout-ship-summary__header');

    shipToHeader.appendChild(
      createShipSummaryEditButton('.checkout__section--delivery', 'Edit shipping address'),
    );
    methodHeader.appendChild(
      createShipSummaryEditButton('.checkout__section--shipping', 'Edit shipping method'),
    );

    // Load edit icons (AEM icon convention)
    const { decorateIcons } = await import('../../scripts/aem.js');
    decorateIcons(root);

    let lastCheckoutPayload = null;
    let lastEstimatePayload = null;

    const resolveMethod = (payload) => {
      if (!payload) return null;
      const selected = payload.shippingAddresses?.[0]?.selectedShippingMethod
        || payload.addresses?.shipping?.selectedShippingMethod;
      if (selected) return selected;

      if (payload.shippingMethod || payload.availableShippingMethods) {
        const estimated = payload.shippingMethod;
        const match = payload.availableShippingMethods?.find((method) => (
          method.code === estimated?.methodCode
          || method.carrier?.code === estimated?.carrierCode
          || method.value === `${estimated?.carrierCode} - ${estimated?.methodCode}`
        )) || payload.availableShippingMethods?.[0];

        if (!match && !estimated) return null;
        return {
          carrier: match?.carrier || { title: estimated?.carrierCode || '' },
          title: match?.title || estimated?.methodCode || '',
        };
      }
      return null;
    };

    const refresh = () => {
      const address = getCartAddress(lastCheckoutPayload, 'shipping')
        || lastCheckoutPayload?.shippingAddresses?.[0]
        || null;
      const { lines, telephone } = getCartAddressDisplayContent(address);

      addressEl.innerHTML = '';
      if (lines.length || telephone) {
        lines.forEach((line, index) => {
          const row = document.createElement('p');
          row.className = index === 0
            ? 'checkout-ship-summary__line checkout-ship-summary__name'
            : 'checkout-ship-summary__line';
          row.textContent = line;
          addressEl.appendChild(row);
        });

        if (telephone) {
          const phone = document.createElement('a');
          phone.className = 'checkout-ship-summary__line checkout-ship-summary__phone';
          phone.href = `tel:${telephone.replace(/\s+/g, '')}`;
          phone.textContent = telephone;
          addressEl.appendChild(phone);
        }

        shipToBlock.hidden = false;
      } else {
        shipToBlock.hidden = true;
      }

      const method = resolveMethod(lastCheckoutPayload) || resolveMethod(lastEstimatePayload);
      const carrierTitle = method?.carrier?.title || '';
      const methodTitle = method?.title || '';
      const methodLabel = [carrierTitle, methodTitle].filter(Boolean).join(' - ');
      if (methodLabel) {
        methodLabelEl.textContent = methodLabel;
        methodBlock.hidden = false;
      } else {
        methodBlock.hidden = true;
      }

      root.hidden = shipToBlock.hidden && methodBlock.hidden;
    };

    const onCheckoutData = (payload) => {
      if (!payload) return;
      lastCheckoutPayload = payload;
      refresh();
    };

    const onEstimate = (payload) => {
      if (!payload) return;
      lastEstimatePayload = payload;
      refresh();
    };

    events.on('checkout/updated', onCheckoutData, { eager: true });
    events.on('checkout/initialized', onCheckoutData, { eager: true });
    events.on('cart/data', onCheckoutData, { eager: true });
    events.on('shipping/estimate', onEstimate, { eager: true });

    onCheckoutData(events.lastPayload('checkout/updated') || events.lastPayload('checkout/initialized'));
    onEstimate(events.lastPayload('shipping/estimate'));

    container.replaceChildren(root);
    return { remove: () => root.remove() };
  },
);

/**
 * Renders place order button with handler functions - follows multi-step pattern
 * @param {HTMLElement} container - DOM element to render the place order button in
 * @param {Object} options - Configuration object with handler functions
 * @param {Function} options.handleValidation - Validation handler function
 * @param {Function} options.handlePlaceOrder - Place order handler function
 * @returns {Promise<Object>} - The rendered place order component
 */
export const renderPlaceOrder = async (container, options = {}) => renderContainer(
  CONTAINERS.PLACE_ORDER_BUTTON,
  async () => CheckoutProvider.render(PlaceOrder, {
    handleValidation: options.handleValidation,
    handlePlaceOrder: options.handlePlaceOrder,
  })(container),
);

/**
 * Renders customer shipping addresses selector/form for authenticated users - original regular checkout functionality
 * @param {HTMLElement} container - DOM element to render shipping addresses in
 * @param {Object} formRef - React-style ref for form reference
 * @param {Object} data - Cart data containing shipping address information
 * @returns {Promise<Object>} - The rendered customer shipping addresses component
 */
export const renderCustomerShippingAddresses = async (container, formRef, data) => renderContainer(
  CONTAINERS.CUSTOMER_SHIPPING_ADDRESSES,
  async () => {
    const placeholders = await fetchPlaceholders('placeholders/checkout.json');

    const cartShippingAddress = getCartAddress(data, 'shipping');

    const shippingAddressId = cartShippingAddress
      ? cartShippingAddress?.id ?? 0
      : undefined;

    const shippingAddressCache = sessionStorage.getItem(SHIPPING_ADDRESS_DATA_KEY);

    // Clear persisted shipping address if cart has a shipping address
    if (cartShippingAddress && shippingAddressCache) {
      sessionStorage.removeItem(SHIPPING_ADDRESS_DATA_KEY);
    }

    const storeConfig = checkoutApi.getStoreConfigCache();

    const inputsDefaultValueSet = cartShippingAddress && cartShippingAddress.id === undefined
      ? transformCartAddressToFormValues(cartShippingAddress)
      : { countryCode: storeConfig.defaultCountry };

    const hasCartShippingAddress = Boolean(data.shippingAddresses?.[0]);
    let isFirstRenderShipping = true;

    // Create address setters with constants moved inside
    const setShippingAddressOnCart = setAddressOnCart({
      type: 'shipping',
      debounceMs: DEBOUNCE_TIME,
    });

    const estimateShippingCostOnCart = estimateShippingCost({
      debounceMs: DEBOUNCE_TIME,
    });

    const notifyShippingValues = debounce((values) => {
      events.emit('checkout/addresses/shipping', values);
    }, ADDRESS_INPUT_DEBOUNCE_TIME);

    return AccountProvider.render(Addresses, {
      addressFormTitle: placeholders?.Checkout?.Addresses?.shippingAddressTitle,
      defaultSelectAddressId: shippingAddressId,
      fieldIdPrefix: 'shipping',
      formName: SHIPPING_FORM_NAME,
      forwardFormRef: formRef,
      hideActionFormButtons: false,
      inputsDefaultValueSet,
      minifiedView: false,
      onAddressData: (values) => {
        const canSetShippingAddressOnCart = !isFirstRenderShipping || !hasCartShippingAddress;
        if (canSetShippingAddressOnCart) setShippingAddressOnCart(values);
        if (!hasCartShippingAddress) estimateShippingCostOnCart(values);
        if (isFirstRenderShipping) isFirstRenderShipping = false;
        notifyShippingValues(values);
      },
      selectable: true,
      selectShipping: true,
      showBillingCheckBox: false,
      showSaveCheckBox: true,
      showShippingCheckBox: false,
      slots: getCheckoutAddressesSlots(),
      // Magento checkout: select an address; edit/remove stays on account pages
      withActionsInFullSizeView: false,
      withActionsInMinifiedView: false,
      title: placeholders?.Checkout?.Addresses?.shippingAddressTitle,
    })(container);
  },
);

/**
 * Renders customer billing addresses selector/form for authenticated users - original regular checkout functionality
 * @param {HTMLElement} container - DOM element to render billing addresses in
 * @param {Object} formRef - React-style ref for form reference
 * @param {Object} data - Cart data containing billing address information
 * @returns {Promise<Object>} - The rendered customer billing addresses component
 */
export const renderCustomerBillingAddresses = async (container, formRef, data) => renderContainer(
  CONTAINERS.CUSTOMER_BILLING_ADDRESSES,
  async () => {
    const placeholders = await fetchPlaceholders('placeholders/checkout.json');

    const cartBillingAddress = getCartAddress(data, 'billing');

    const billingAddressId = cartBillingAddress
      ? cartBillingAddress?.id ?? 0
      : undefined;

    const billingAddressCache = sessionStorage.getItem(BILLING_ADDRESS_DATA_KEY);

    // Clear persisted billing address if cart has a billing address
    if (cartBillingAddress && billingAddressCache) {
      sessionStorage.removeItem(BILLING_ADDRESS_DATA_KEY);
    }

    const storeConfig = checkoutApi.getStoreConfigCache();

    const inputsDefaultValueSet = cartBillingAddress && cartBillingAddress.id === undefined
      ? transformCartAddressToFormValues(cartBillingAddress)
      : { countryCode: storeConfig.defaultCountry };

    const hasCartBillingAddress = Boolean(data.billingAddress);
    let isFirstRenderBilling = true;

    // Create address setter with constants moved inside
    const setBillingAddressOnCart = setAddressOnCart({
      type: 'billing',
      debounceMs: DEBOUNCE_TIME,
    });

    const notifyBillingValues = debounce((values) => {
      events.emit('checkout/addresses/billing', values);
    }, ADDRESS_INPUT_DEBOUNCE_TIME);

    return AccountProvider.render(Addresses, {
      addressFormTitle: placeholders?.Checkout?.Addresses?.billToNewAddress,
      defaultSelectAddressId: billingAddressId,
      formName: BILLING_FORM_NAME,
      forwardFormRef: formRef,
      hideActionFormButtons: false,
      inputsDefaultValueSet,
      minifiedView: false,
      onAddressData: (values) => {
        const canSetBillingAddressOnCart = !isFirstRenderBilling || !hasCartBillingAddress;
        if (canSetBillingAddressOnCart) setBillingAddressOnCart(values);
        if (isFirstRenderBilling) isFirstRenderBilling = false;
        notifyBillingValues(values);
      },
      selectable: true,
      selectBilling: true,
      showBillingCheckBox: false,
      showSaveCheckBox: true,
      showShippingCheckBox: false,
      slots: getCheckoutAddressesSlots(),
      withActionsInFullSizeView: false,
      withActionsInMinifiedView: false,
      title: placeholders?.Checkout?.Addresses?.billingAddressTitle,
    })(container);
  },
);

/**
 * Renders address form for guest users (shipping or billing) - original regular checkout functionality
 * @param {HTMLElement} container - DOM element to render address form in
 * @param {Object} formRef - React-style ref for form reference
 * @param {Object} data - Cart data containing address information
 * @param {string} addressType - Type of address form ('shipping' or 'billing')
 * @returns {Promise<Object>} - The rendered address form component
 */
export const renderAddressForm = async (container, formRef, data, addressType) => {
  const isShipping = addressType === 'shipping';
  const containerKey = isShipping ? CONTAINERS.SHIPPING_ADDRESS_FORM : CONTAINERS.BILLING_ADDRESS_FORM;

  return renderContainer(
    containerKey,
    async () => {
      const placeholders = await fetchPlaceholders('placeholders/checkout.json');

      // Get address type specific configurations
      const cartAddress = getCartAddress(data, addressType);
      const addressDataKey = isShipping ? SHIPPING_ADDRESS_DATA_KEY : BILLING_ADDRESS_DATA_KEY;
      const addressCache = sessionStorage.getItem(addressDataKey);

      // Clear persisted address if cart has an address
      if (cartAddress && addressCache) {
        sessionStorage.removeItem(addressDataKey);
      }

      let isFirstRender = true;
      const hasCartAddress = Boolean(isShipping ? data.shippingAddresses?.[0] : data.billingAddress);

      // Create address setter with appropriate API
      const setAddressOnCartFn = setAddressOnCart({
        type: addressType,
        debounceMs: DEBOUNCE_TIME,
      });

      // Create shipping cost estimator (only for shipping addresses)
      const estimateShippingCostOnCart = isShipping ? estimateShippingCost({
        debounceMs: DEBOUNCE_TIME,
      }) : null;

      const notifyValues = debounce((values) => {
        const eventType = isShipping ? 'checkout/addresses/shipping' : 'checkout/addresses/billing';
        events.emit(eventType, values);
      }, ADDRESS_INPUT_DEBOUNCE_TIME);

      const storeConfig = checkoutApi.getStoreConfigCache();

      // Address type specific configurations
      const formName = isShipping ? SHIPPING_FORM_NAME : BILLING_FORM_NAME;
      const addressTitle = isShipping
        ? placeholders?.Checkout?.Addresses?.shippingAddressTitle
        : placeholders?.Checkout?.Addresses?.billingAddressTitle;
      const className = isShipping
        ? 'checkout-shipping-form__address-form'
        : 'checkout-billing-form__address-form';

      const inputsDefaultValueSet = cartAddress
        ? transformCartAddressToFormValues(cartAddress)
        : { countryCode: storeConfig.defaultCountry };

      return AccountProvider.render(AddressForm, {
        addressesFormTitle: addressTitle,
        className,
        fieldIdPrefix: addressType,
        formName,
        forwardFormRef: formRef,
        hideActionFormButtons: true,
        inputsDefaultValueSet,
        isOpen: true,
        onChange: (values) => {
          const canSetAddressOnCart = !isFirstRender || !hasCartAddress;
          if (canSetAddressOnCart) setAddressOnCartFn(values);

          // Only estimate shipping cost for shipping addresses when no cart address exists
          if (isShipping && !hasCartAddress && estimateShippingCostOnCart) {
            estimateShippingCostOnCart(values);
          }

          if (isFirstRender) isFirstRender = false;

          notifyValues(values);
        },
        showBillingCheckBox: false,
        showFormLoader: false,
        showShippingCheckBox: false,
      })(container);
    },
  );
};

/**
 * Renders order-level gift options with swatch image integration
 * @param {HTMLElement} container - DOM element to render gift options in
 * @returns {Promise<Object>} - The rendered gift options component
 */
export const renderGiftOptions = async (container) => renderContainer(
  CONTAINERS.GIFT_OPTIONS,
  async () => CartProvider.render(GiftOptions, {
    view: 'order',
    dataSource: 'cart',
    isEditable: false,
    slots: {
      SwatchImage: swatchImageSlot,
    },
  })(container),
);
