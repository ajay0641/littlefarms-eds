/**
 * Little Farms PLP card helpers.
 * Reads only fields present on the Catalog Service product (search) response.
 *
 * Confirmed attributes:
 * - lf_brand → brand line
 * - ls_salespacksize → pack / weight line
 */

/**
 * @param {object} product
 * @param {string} name
 * @returns {string}
 */
export function getProductAttribute(product, name) {
  const attrs = product?.attributes || [];
  const match = attrs.find((attr) => String(attr?.name || '').toLowerCase() === name.toLowerCase());
  const raw = match?.value;
  if (raw == null) return '';
  return String(raw).replace(/<[^>]*>/g, '').trim();
}

/**
 * @param {number} [amount]
 * @param {string} [currency]
 * @returns {string}
 */
export function formatCardPrice(amount, currency) {
  if (!Number.isFinite(amount) || !currency) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount);
  } catch {
    return '';
  }
}

/**
 * @param {object} product
 * @returns {{ final: number|null, regular: number|null, currency: string, onSale: boolean }}
 */
export function getProductPrices(product) {
  const source = product?.price || product?.priceRange?.minimum;
  const currency = source?.final?.amount?.currency
    || source?.regular?.amount?.currency
    || '';
  const final = Number(source?.final?.amount?.value);
  const regular = Number(source?.regular?.amount?.value);
  const hasFinal = Number.isFinite(final);
  const hasRegular = Number.isFinite(regular);
  const onSale = hasRegular && hasFinal && regular > final;

  return {
    final: hasFinal ? final : null,
    regular: hasRegular ? regular : null,
    currency,
    onSale,
  };
}

/**
 * Tags the drop-in card so global `.product-item` styles apply.
 * @param {Element} fromEl
 */
export function markProductItemCard(fromEl) {
  const card = fromEl?.closest?.('.dropin-product-item-card');
  if (card) card.classList.add('product-item');
}

/**
 * @param {object} product
 * @returns {HTMLElement|null}
 */
export function createBrand(product) {
  const brand = getProductAttribute(product, 'lf_brand');
  if (!brand) return null;
  const brandEl = document.createElement('span');
  brandEl.className = 'brand';
  brandEl.textContent = brand;
  return brandEl;
}

/**
 * @param {object} product
 * @param {string} productUrl
 * @returns {HTMLElement}
 */
export function createProductName(product, productUrl) {
  const titleWrap = document.createElement('strong');
  titleWrap.className = 'product name product-item-name';
  const titleLink = document.createElement('a');
  titleLink.className = 'product-item-link';
  titleLink.href = productUrl;
  titleLink.title = product.name || '';
  titleLink.textContent = product.name || product.sku || '';
  titleWrap.append(titleLink);
  return titleWrap;
}

/**
 * @param {object} product
 * @returns {HTMLElement|null}
 */
export function createPackageLine(product) {
  const pack = getProductAttribute(product, 'ls_salespacksize');
  if (!pack) return null;
  const packageEl = document.createElement('div');
  packageEl.className = 'package ecom-weight';
  packageEl.textContent = pack;
  return packageEl;
}

/**
 * @param {object} product
 * @returns {HTMLElement}
 */
export function createPriceBox(product) {
  const {
    final, regular, currency, onSale,
  } = getProductPrices(product);
  const displayPrice = onSale ? regular : (final ?? regular);
  const priceBox = document.createElement('div');
  priceBox.className = 'price-box price-final_price';

  if (displayPrice == null || !currency) return priceBox;

  const finalWrap = document.createElement('span');
  finalWrap.className = 'price-wrapper final-price';
  const priceVal = document.createElement('span');
  priceVal.className = 'price';
  priceVal.textContent = formatCardPrice(displayPrice, currency);
  finalWrap.append(priceVal);
  priceBox.append(finalWrap);

  if (onSale && final != null) {
    const promo = document.createElement('span');
    promo.className = 'minimal-price-link';
    const promoVal = document.createElement('span');
    promoVal.className = 'price-wrapper';
    promoVal.textContent = formatCardPrice(final, currency);
    promo.append(promoVal);
    priceBox.append(promo);
  }

  return priceBox;
}

/**
 * @param {object} product
 * @param {{ onClick: Function, disabled?: boolean, label: string }} options
 * @returns {HTMLElement}
 */
export function createAddToCartButton(product, { onClick, disabled, label }) {
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'actions-primary';

  const atcBtn = document.createElement('button');
  atcBtn.type = 'button';
  atcBtn.className = 'action tocart primary';
  atcBtn.title = label;
  atcBtn.setAttribute('aria-label', label);
  atcBtn.disabled = !!disabled;
  atcBtn.innerHTML = '<span>Add to Cart</span>';
  atcBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(product, atcBtn);
  });

  actionsWrap.append(atcBtn);
  return actionsWrap;
}

/**
 * @param {object} product
 * @param {string} productUrl
 * @param {{ wishlistEl: HTMLElement, atcEl: HTMLElement }} parts
 * @returns {HTMLElement}
 */
export function createProductDetails(product, productUrl, { wishlistEl, atcEl }) {
  const details = document.createElement('div');
  details.className = 'product details product-item-details';

  const brand = createBrand(product);
  if (brand) details.append(brand);

  if (wishlistEl) {
    wishlistEl.classList.add('wishlist-container');
    details.append(wishlistEl);
  }

  details.append(createProductName(product, productUrl));
  const packageLine = createPackageLine(product);
  if (packageLine) details.append(packageLine);

  const inner = document.createElement('div');
  inner.className = 'product-item-inner';
  const left = document.createElement('div');
  left.className = 'left';
  left.append(createPriceBox(product));
  inner.append(left);
  if (atcEl) inner.append(atcEl);
  details.append(inner);

  return details;
}

/**
 * @param {object} ctx
 */
export function replaceWithEmpty(ctx) {
  const empty = document.createElement('div');
  empty.hidden = true;
  ctx.replaceWith(empty);
}
