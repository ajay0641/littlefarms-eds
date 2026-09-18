/* eslint-disable import/no-unresolved */
import { ProgressSpinner, provider as UI } from '@dropins/tools/components.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import { ORDER_DETAILS_PATH, rootLink } from '../../scripts/commerce.js';
import { getUserTokenCookie } from '../../scripts/initializers/index.js';
import createModal from '../modal/modal.js';

/**
 * Displays an overlay spinner in the specified container
 * @param {Object} loaderRef - Ref object to store the spinner component
 * @param {HTMLElement} $loader - DOM element to render the spinner in
 * @param {HTMLElement} [$loaderStatus] - Persistent live region for screen-reader announcement
 */
export const displayOverlaySpinner = async (loaderRef, $loader, $loaderStatus) => {
  // Kept as a separate, persistently mounted live region so the
  // announcement isn't missed when the spinner mounts and unmounts
  // together with the live region attached to it.
  if ($loaderStatus) $loaderStatus.textContent = 'Placing your order…';

  if (loaderRef.current) return;

  loaderRef.current = await UI.render(ProgressSpinner, {
    className: '.checkout__overlay-spinner',
  })($loader);
};

/**
 * Removes the overlay spinner and cleans up references
 * @param {Object} loaderRef - Ref object containing the spinner component
 * @param {HTMLElement} $loader - DOM element containing the spinner
 * @param {HTMLElement} [$loaderStatus] - Persistent live region for screen-reader announcement
 */
export const removeOverlaySpinner = (loaderRef, $loader, $loaderStatus) => {
  if ($loaderStatus) $loaderStatus.textContent = '';

  if (!loaderRef.current) return;

  loaderRef.current.remove();
  loaderRef.current = null;
  $loader.innerHTML = '';
};

// Modal state management
let modal;

/**
 * Shows a modal with the specified content
 * @param {HTMLElement} content - DOM element to display in the modal
 */
export const showModal = async (content) => {
  // Magento LF: scope auth popup styles on checkout
  content.classList.add('checkout__auth-modal');
  modal = await createModal([content]);
  modal.showModal();
};

/**
 * Removes the currently displayed modal and cleans up references
 */
export const removeModal = () => {
  if (!modal) return;
  modal.removeModal();
  modal = null;
};

/**
 * Renders AEM asset images for gift option swatches
 * @param {Object} ctx - The context object containing imageSwatchContext and defaultImageProps
 */
export function swatchImageSlot(ctx) {
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

/**
 * Resolve ISO country code to a display name (e.g. SG → Singapore).
 * @param {string} codeOrName
 * @returns {string}
 */
function resolveCountryDisplayName(codeOrName) {
  if (!codeOrName) return '';
  const value = String(codeOrName).trim();
  if (value.length > 3) return value;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(value.toUpperCase()) || value;
  } catch {
    return value;
  }
}

/**
 * Read a field from AddressCard data supporting Magento codes and camelCase keys.
 * @param {Record<string, string>} byName
 * @param {...string} keys
 * @returns {string}
 */
function pickAddressField(byName, ...keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const value = byName[keys[i]];
    if (value) return value;
  }
  return '';
}

/**
 * Builds Magento-style address card lines from Addresses AddressCard slot data.
 * Example:
 *   Ajay Prajapati
 *   test, 2nd floor, Test Apartment
 *   Houston, 77022
 *   Singapore
 *   1234567890
 * @param {Array<{ name?: string, value?: string }>} addressData
 * @returns {string[]}
 */
export function formatCheckoutAddressCardLines(addressData = []) {
  const byName = {};
  addressData.forEach((field) => {
    if (!field?.name) return;
    const value = field.value == null ? '' : String(field.value).trim();
    if (value) byName[field.name] = value;
  });

  const lines = [];
  // Drop-in keysSortOrder uses Magento codes (firstname); address model may use firstName
  const fullName = [
    pickAddressField(byName, 'firstname', 'firstName'),
    pickAddressField(byName, 'middlename', 'middleName'),
    pickAddressField(byName, 'lastname', 'lastName'),
  ].filter(Boolean).join(' ');
  if (fullName) lines.push(fullName);

  const company = pickAddressField(byName, 'company');
  if (company) lines.push(company);

  const streetKeys = Object.keys(byName)
    .filter((key) => (
      key === 'street'
      || /^street(_)?[Mm]ultiline_?\d+$/.test(key)
      || /^streetMultiline_\d+$/.test(key)
      || /^street_multiline_\d+$/.test(key)
    ))
    .sort((a, b) => {
      if (a === 'street') return -1;
      if (b === 'street') return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  const streetLine = streetKeys.map((key) => byName[key]).filter(Boolean).join(', ');
  if (streetLine) lines.push(streetLine);

  const city = pickAddressField(byName, 'city');
  const postcode = pickAddressField(byName, 'postcode', 'postCode', 'zip');
  const cityPostcode = [city, postcode].filter(Boolean).join(', ');
  if (cityPostcode) lines.push(cityPostcode);

  const country = resolveCountryDisplayName(
    pickAddressField(byName, 'countryCode', 'country_code', 'country'),
  );
  if (country) lines.push(country);

  const telephone = pickAddressField(byName, 'telephone', 'phone', 'fax');
  if (telephone) lines.push(telephone);

  return lines;
}

/**
 * Addresses slot: format saved address card content for checkout.
 * @param {Object} ctx - AddressCard slot context
 */
export function checkoutAddressCardSlot(ctx) {
  const addressData = ctx?.addressData || [];
  const wrapper = document.createElement('div');
  wrapper.className = 'checkout-address-card';

  formatCheckoutAddressCardLines(addressData).forEach((line, index) => {
    const row = document.createElement('p');
    row.className = index === 0
      ? 'checkout-address-card__name'
      : 'checkout-address-card__line';
    row.textContent = line;
    wrapper.appendChild(row);
  });

  ctx.replaceWith(wrapper);
}

/**
 * Addresses slot: Cancel closes "Use a different address" by re-selecting a saved address.
 * @param {Object} ctx - AddressFormActions slot context
 */
export function checkoutAddressFormActionsSlot(ctx) {
  const actions = document.createElement('div');
  actions.className = 'checkout-address-form__actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'lf-button lf-button--small checkout-address-form__cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const root = cancel.closest('.account-addresses-wrapper--select-view');
    const saved = root?.querySelector('input[type="radio"]:not([value="0"])');
    if (saved) {
      saved.click();
      return;
    }
    // No saved addresses: keep form usable; blur only
    cancel.blur();
  });

  actions.appendChild(cancel);
  if (typeof ctx.appendChild === 'function') {
    ctx.appendChild(actions);
  } else if (typeof ctx.replaceWith === 'function') {
    ctx.replaceWith(actions);
  }
}

/**
 * Shared Addresses slots for selectable checkout shipping/billing lists.
 * @returns {Object}
 */
export function getCheckoutAddressesSlots() {
  return {
    AddressCard: checkoutAddressCardSlot,
    AddressFormActions: checkoutAddressFormActionsSlot,
  };
}

/**
 * Convert checkout cart address model into Magento-style display lines.
 * @param {Object} address - Cart shipping/billing address from checkout drop-in
 * @returns {{ lines: string[], telephone: string }}
 */
export function getCartAddressDisplayContent(address) {
  if (!address) return { lines: [], telephone: '' };

  const street = Array.isArray(address.street)
    ? address.street.filter(Boolean)
    : [address.street].filter(Boolean);

  const fields = [
    { name: 'firstname', value: address.firstName || address.firstname },
    { name: 'middlename', value: address.middleName || address.middlename },
    { name: 'lastname', value: address.lastName || address.lastname },
    { name: 'company', value: address.company },
    ...street.map((line, index) => ({
      name: index === 0 ? 'street' : `streetMultiline_${index + 1}`,
      value: line,
    })),
    { name: 'city', value: address.city },
    { name: 'postcode', value: address.postCode || address.postcode },
    {
      name: 'countryCode',
      value: address.country?.label || address.country?.code || address.countryCode,
    },
  ];

  return {
    lines: formatCheckoutAddressCardLines(fields),
    telephone: String(address.telephone || '').trim(),
  };
}

/**
 * Builds the order details URL based on authentication status
 * @param {Object} orderData - Order data containing number and token
 * @param {string} orderDetailsPath - Path to the order details page
 * @returns {string} The constructed order details URL
 */
export function buildOrderDetailsUrl(orderData, orderDetailsPath = ORDER_DETAILS_PATH) {
  const token = getUserTokenCookie();
  const orderRef = token ? orderData.number : orderData.token;
  const orderNumber = orderData.number;
  const encodedOrderRef = encodeURIComponent(orderRef);
  const encodedOrderNumber = encodeURIComponent(orderNumber);

  return token
    ? rootLink(`${orderDetailsPath}?orderRef=${encodedOrderRef}`)
    : rootLink(`${orderDetailsPath}?orderRef=${encodedOrderRef}&orderNumber=${encodedOrderNumber}`);
}
