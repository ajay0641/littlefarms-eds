/* eslint-disable import/no-unresolved */

// Tools and initializers
import { Button, provider as UI } from '@dropins/tools/components.js';
import { initializers } from '@dropins/tools/initializer.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import { events } from '@dropins/tools/event-bus.js';

// Order Dropin API
import * as orderApi from '@dropins/storefront-order/api.js';
import { render as OrderProvider } from '@dropins/storefront-order/render.js';
import OrderHeader from '@dropins/storefront-order/containers/OrderHeader.js';
import OrderStatus from '@dropins/storefront-order/containers/OrderStatus.js';
import ShippingStatus from '@dropins/storefront-order/containers/ShippingStatus.js';
import CustomerDetails from '@dropins/storefront-order/containers/CustomerDetails.js';
import OrderCostSummary from '@dropins/storefront-order/containers/OrderCostSummary.js';
import OrderProductList from '@dropins/storefront-order/containers/OrderProductList.js';

// Checkout API/utils used for header and DOM
import * as checkoutApi from '@dropins/storefront-checkout/api.js';
import { createFragment, createScopedSelector } from '@dropins/storefront-checkout/lib/utils.js';

// Cart (for gift options within order confirmation)
import { render as CartProvider } from '@dropins/storefront-cart/render.js';
import GiftOptions from '@dropins/storefront-cart/containers/GiftOptions.js';

// Auth (for sign-up modal in header)
import { render as AuthProvider } from '@dropins/storefront-auth/render.js';
import SignUp from '@dropins/storefront-auth/containers/SignUp.js';

// Commerce helpers
import {
  fetchPlaceholders,
  rootLink,
  authPrivacyPolicyConsentSlot,
} from '../../scripts/commerce.js';

// Ensure order drop-in initializer side effects are applied
import '../../scripts/initializers/order.js';

// Local modal helper
import createModal from '../modal/modal.js';
import { loadCSS } from '../../scripts/aem.js';

// ----------------------------------------------------------------------------
// Local selectors and fragments (order confirmation only)
// ----------------------------------------------------------------------------

/**
 * Order confirmation copy. Authors can override either string from
 * placeholders/order.json using the keys below; these are the defaults.
 */
const COPY = Object.freeze({
  title: 'Thanks for shopping with us!',
  emailNotice: "We'll send you an order confirmation email with your details and tracking info soon",
  printReceipt: 'Print receipt',
});

const selectors = Object.freeze({
  orderConfirmation: {
    header: '.order-confirmation__header',
    emailNotice: '.order-confirmation__email-notice',
    print: '.order-confirmation__print',
    orderStatus: '.order-confirmation__order-status',
    shippingStatus: '.order-confirmation__shipping-status',
    customerDetails: '.order-confirmation__customer-details',
    orderCostSummary: '.order-confirmation__order-cost-summary',
    giftOptions: '.order-confirmation__gift-options',
    orderProductList: '.order-confirmation__order-product-list',
    footer: '.order-confirmation__footer',
    continueButton: '.order-confirmation-footer__continue-button',
  },
});

function createOrderConfirmationFragment() {
  return createFragment(`
    <div class="order-confirmation">
      <div class="order-confirmation__greeting">
        <button
          type="button"
          class="order-confirmation__print"
          data-testid="order-confirmation__print"
        >Print receipt</button>
        <div class="order-confirmation__header order-confirmation__block"></div>
        <p class="order-confirmation__email-notice" data-testid="order-confirmation__email-notice"></p>
        <div class="order-confirmation__footer order-confirmation__block"></div>
      </div>
      <div class="order-confirmation__main">
        <div class="order-confirmation__order-status order-confirmation__block"></div>
        <div class="order-confirmation__shipping-status order-confirmation__block"></div>
        <div class="order-confirmation__customer-details order-confirmation__block"></div>
      </div>
      <div class="order-confirmation__aside">
        <div class="order-confirmation__order-cost-summary order-confirmation__block"></div>
        <div class="order-confirmation__gift-options order-confirmation__block"></div>
        <div class="order-confirmation__order-product-list order-confirmation__block"></div>
      </div>
    </div>
  `);
}

function createOrderConfirmationFooter() {
  return `
    <div class="order-confirmation-footer__continue-button"></div>
  `;
}

// ----------------------------------------------------------------------------
// Local utility slots (swatch and modal)
// ----------------------------------------------------------------------------

function swatchImageSlot(ctx) {
  const { imageSwatchContext, defaultImageProps } = ctx;
  tryRenderAemAssetsImage(ctx, {
    alias: imageSwatchContext.label,
    imageProps: defaultImageProps,
    wrapper: document.createElement('span'),
    params: {
      width: defaultImageProps.width,
      height: defaultImageProps.height,
    },
  });
}

let signUpModal;

const handleAuthenticated = (authenticated) => {
  if (authenticated) {
    window.location.reload();
  }
};

// ----------------------------------------------------------------------------
// Local renderers (order confirmation only)
// ----------------------------------------------------------------------------

async function renderOrderHeader(container, options = {}) {
  const handleSignUpClick = async ({ inputsDefaultValueSet, addressesData }) => {
    const signUpForm = document.createElement('div');
    AuthProvider.render(SignUp, {
      inputsDefaultValueSet,
      addressesData,
      routeSignIn: () => rootLink('/customer/login'),
      routeRedirectOnEmailConfirmationClose: () => rootLink('/customer/account'),
      slots: { ...authPrivacyPolicyConsentSlot },
    })(signUpForm);
    signUpModal = await createModal([signUpForm]);
    signUpModal.showModal();
  };

  return OrderProvider.render(OrderHeader, {
    handleEmailAvailability: checkoutApi.isEmailAvailable,
    handleSignUpClick,
    ...options,
  })(container);
}

async function renderOrderStatus(container) {
  return OrderProvider.render(OrderStatus, { slots: { OrderActions: () => null } })(container);
}

async function renderShippingStatus(container) {
  return OrderProvider.render(ShippingStatus)(container);
}

async function renderCustomerDetails(container) {
  return OrderProvider.render(CustomerDetails)(container);
}

async function renderOrderCostSummary(container) {
  return OrderProvider.render(OrderCostSummary)(container);
}

async function renderOrderProductList(container) {
  return OrderProvider.render(OrderProductList, {
    slots: {
      Footer: (ctx) => {
        const giftOptions = document.createElement('div');
        CartProvider.render(GiftOptions, {
          item: ctx.item,
          view: 'product',
          dataSource: 'order',
          isEditable: false,
          slots: {
            SwatchImage: swatchImageSlot,
          },
        })(giftOptions);
        ctx.appendChild(giftOptions);
      },
      CartSummaryItemImage: (ctx) => {
        const { data, defaultImageProps } = ctx;
        tryRenderAemAssetsImage(ctx, {
          alias: data.product.sku,
          imageProps: defaultImageProps,
          params: {
            width: defaultImageProps.width,
            height: defaultImageProps.height,
          },
        });
      },
    },
  })(container);
}

async function renderOrderGiftOptions(container) {
  return CartProvider.render(GiftOptions, {
    view: 'order',
    dataSource: 'order',
    isEditable: false,
    readOnlyFormOrderView: 'secondary',
    slots: {
      SwatchImage: swatchImageSlot,
    },
  })(container);
}

async function renderOrderConfirmationFooterButton(container) {
  return UI.render(Button, {
    children: 'Continue Shopping',
    'data-testid': 'order-confirmation-footer__continue-button',
    // Global organic outline button that fills on hover (see styles.css .lf-button)
    className: 'order-confirmation-footer__continue-button lf-button lf-button--normal',
    size: 'medium',
    variant: 'secondary',
    type: 'submit',
    href: rootLink('/'),
  })(container);
}

async function renderCheckoutSuccessContent(container, { orderData } = {}) {
  // Register event handler for authenticated event
  events.on('authenticated', handleAuthenticated);

  // Scroll to top on success view
  window.scrollTo(0, 0);

  // Create order confirmation layout using local fragments
  const orderConfirmationFragment = createOrderConfirmationFragment();

  // Scoped selector for the fragment
  const getOrderElement = createScopedSelector(orderConfirmationFragment);

  // Query all required elements using local selectors
  const $orderConfirmationHeader = getOrderElement(selectors.orderConfirmation.header);
  const $emailNotice = getOrderElement(selectors.orderConfirmation.emailNotice);
  const $print = getOrderElement(selectors.orderConfirmation.print);
  const $orderStatus = getOrderElement(selectors.orderConfirmation.orderStatus);
  const $shippingStatus = getOrderElement(selectors.orderConfirmation.shippingStatus);
  const $customerDetails = getOrderElement(selectors.orderConfirmation.customerDetails);
  const $orderCostSummary = getOrderElement(selectors.orderConfirmation.orderCostSummary);
  const $orderGiftOptions = getOrderElement(selectors.orderConfirmation.giftOptions);
  const $orderProductList = getOrderElement(selectors.orderConfirmation.orderProductList);
  const $orderConfirmationFooter = getOrderElement(selectors.orderConfirmation.footer);

  container.replaceChildren(orderConfirmationFragment);

  // Mount order drop-in with localized placeholders (and optional order data)
  const labels = await fetchPlaceholders();
  const authored = labels.Order?.OrderConfirmation ?? {};
  const title = authored.title || COPY.title;

  // OrderHeader has no slot for extra copy, so the title is supplied through the
  // drop-in's own translations. Both keys are set to the same string: the greeting
  // is the same whether or not we know the customer's name.
  const langDefinitions = {
    default: {
      ...labels,
      Order: {
        ...labels.Order,
        OrderHeader: {
          ...labels.Order?.OrderHeader,
          title,
          defaultTitle: title,
        },
      },
    },
  };
  const initOptions = orderData ? { langDefinitions, orderData } : { langDefinitions };
  await initializers.mountImmediately(orderApi.initialize, initOptions);

  $emailNotice.textContent = authored.emailNotice || COPY.emailNotice;
  $print.textContent = authored.printReceipt || COPY.printReceipt;
  $print.addEventListener('click', () => window.print());

  // Render all order confirmation containers using local renderers
  await Promise.all([
    renderOrderHeader($orderConfirmationHeader, { orderData }),
    renderOrderStatus($orderStatus),
    renderShippingStatus($shippingStatus),
    renderCustomerDetails($customerDetails),
    renderOrderCostSummary($orderCostSummary),
    renderOrderProductList($orderProductList),
    renderOrderGiftOptions($orderGiftOptions),
  ]);

  // Footer content and continue button
  $orderConfirmationFooter.innerHTML = createOrderConfirmationFooter();
  const $continueBtn = $orderConfirmationFooter.querySelector(
    selectors.orderConfirmation.continueButton,
  );
  await renderOrderConfirmationFooterButton($continueBtn);
}

export function preloadCheckoutSuccess() {
  return loadCSS(`${window.hlx.codeBasePath}/blocks/commerce-checkout-success/commerce-checkout-success.css`);
}

export async function renderCheckoutSuccess(container, { orderData } = {}) {
  return renderCheckoutSuccessContent(container, { orderData });
}

export default async function decorate(block) {
  await renderCheckoutSuccessContent(block);
}
