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
import Coupons from '@dropins/storefront-cart/containers/Coupons.js';
import GiftCards from '@dropins/storefront-cart/containers/GiftCards.js';
import GiftOptions from '@dropins/storefront-cart/containers/GiftOptions.js';
import OrderSummary from '@dropins/storefront-cart/containers/OrderSummary.js';
import { render as CartProvider } from '@dropins/storefront-cart/render.js';

// Payment Services Dropin
import { PaymentMethodCode } from '@dropins/storefront-payment-services/api.js';
import CreditCard from '@dropins/storefront-payment-services/containers/CreditCard.js';
import { render as PaymentServices } from '@dropins/storefront-payment-services/render.js';

// Tools
import {
  Header,
  provider as UI,
} from '@dropins/tools/components.js';
import { events } from '@dropins/tools/event-bus.js';
import { debounce } from '@dropins/tools/lib.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';

// Checkout Dropin Libs
import {
  estimateShippingCost,
  setAddressOnCart,
  getCartAddress,
  transformCartAddressToFormValues,
} from '@dropins/storefront-checkout/lib/utils.js';

import { showModal, swatchImageSlot } from './utils.js';

// External dependencies
import {
  authPrivacyPolicyConsentSlot,
  fetchPlaceholders,
  rootLink,
} from '../../scripts/commerce.js';

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
 * Renders cart coupons for order summary slot
 * @param {HTMLElement} ctx - The slot context element
 * @returns {void}
 */
export const renderCartCoupons = (ctx) => {
  const coupons = document.createElement('div');
  CartProvider.render(Coupons)(coupons);
  ctx.appendChild(coupons);
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
 * Renders order summary with estimate shipping, coupons, and gift cards slots
 * @param {HTMLElement} container - DOM element to render order summary in
 * @returns {Promise<Object>} - The rendered order summary component
 */
export const renderOrderSummary = async (container) => renderContainer(
  CONTAINERS.ORDER_SUMMARY,
  async () => CartProvider.render(OrderSummary, {
    slots: {
      EstimateShipping: renderEstimateShipping,
      Coupons: renderCartCoupons,
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
