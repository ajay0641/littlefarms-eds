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
 * Find a cart line item for the given product SKU.
 *
 * @param {Object|null|undefined} cart
 * @param {string} sku
 * @return {{uid: string, quantity: number}|null}
 */
export function findCartItemBySku(cart, sku) {
  if (!cart?.items?.length || !sku) return null;
  const target = String(sku).toUpperCase();
  const match = cart.items.find((item) => {
    const itemSku = String(item?.sku || '').toUpperCase();
    const topSku = String(item?.topLevelSku || '').toUpperCase();
    return itemSku === target || topSku === target;
  });
  if (!match || !(match.quantity > 0)) return null;
  return { uid: match.uid, quantity: match.quantity };
}

/**
 * Creates Magento-style Add to Cart control with loading + qty stepper.
 *
 * Flow: Add to Cart → Adding... → Added → qty stepper.
 *
 * @param {Object} product
 * @param {{
 *   label: string,
 *   disabled?: boolean,
 *   addLabel?: string,
 *   addingLabel?: string,
 *   addedLabel?: string,
 *   addedDelayMs?: number,
 *   onAdd: (product: Object) => Promise<Object|null|undefined>,
 *   onUpdateQty: (uid: string, quantity: number) => Promise<Object|null|undefined>,
 * }} options
 * @return {HTMLElement}
 */
export function createAddToCartButton(product, {
  label,
  disabled = false,
  addLabel = 'Add to Cart',
  addingLabel = 'Adding...',
  addedLabel = 'Added',
  addedDelayMs = 1000,
  onAdd,
  onUpdateQty,
}) {
  /** @type {string|null} */
  let cartItemUid = null;
  /** @type {number} */
  let currentQty = 0;
  /** @type {boolean} */
  let busy = false;
  /** @type {Object|null|undefined} */
  let pendingCart = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let qtyDebounceTimer = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let addedTimer = null;

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'actions-primary';
  actionsWrap.dataset.sku = product.sku || '';

  const atcBtn = document.createElement('button');
  atcBtn.type = 'button';
  atcBtn.className = 'action tocart primary';
  atcBtn.title = label;
  atcBtn.setAttribute('aria-label', label);
  atcBtn.disabled = !!disabled;
  atcBtn.innerHTML = `<span>${addLabel}</span>`;
  const atcLabel = atcBtn.querySelector('span');

  const qtyBlock = document.createElement('div');
  qtyBlock.className = 'addtocart-qty-block';
  qtyBlock.hidden = true;
  qtyBlock.innerHTML = `
    <button type="button" class="action decrease" aria-label="Decrease quantity">
      <span class="minus"></span>
    </button>
    <div class="input-text qty">
      <input type="number" min="0" value="1" class="input-text" aria-label="Quantity" />
    </div>
    <button type="button" class="action increase" aria-label="Increase quantity">
      <span class="plus"></span>
    </button>
  `;

  const $decBtn = qtyBlock.querySelector('.action.decrease');
  const $incBtn = qtyBlock.querySelector('.action.increase');
  const $qtyInput = qtyBlock.querySelector('input');

  /**
   * @param {boolean} isBusy
   * @param {string} [busyLabel]
   * @return {void}
   */
  const setBusy = (isBusy, busyLabel) => {
    busy = isBusy;
    const qtyVisible = !qtyBlock.hidden;
    atcBtn.disabled = (isBusy && !qtyVisible) || !!disabled;
    atcBtn.classList.toggle('disabled', isBusy && !qtyVisible);
    atcBtn.classList.toggle('is-adding', isBusy && !qtyVisible);
    if (atcLabel) {
      if (isBusy && !qtyVisible) {
        atcLabel.textContent = busyLabel || addingLabel;
      } else if (!isBusy) {
        atcLabel.textContent = addLabel;
      }
    }
    if ($decBtn) $decBtn.disabled = isBusy;
    if ($incBtn) $incBtn.disabled = isBusy;
    if ($qtyInput) $qtyInput.disabled = isBusy;
  };

  /**
   * @param {number} qty
   * @return {void}
   */
  const showQty = (qty) => {
    currentQty = qty;
    atcBtn.hidden = true;
    qtyBlock.hidden = false;
    if ($qtyInput) $qtyInput.value = String(qty);
  };

  /**
   * @return {void}
   */
  const showAtc = () => {
    cartItemUid = null;
    currentQty = 0;
    qtyBlock.hidden = true;
    atcBtn.hidden = false;
    if ($qtyInput) $qtyInput.value = '1';
  };

  /**
   * Apply cart line state to the control (no "Added" delay).
   *
   * @param {Object|null|undefined} cart
   * @return {void}
   */
  const applyCartState = (cart) => {
    const item = findCartItemBySku(cart, product.sku);
    if (item) {
      cartItemUid = item.uid;
      showQty(item.quantity);
      setBusy(false);
      return;
    }
    showAtc();
    setBusy(false);
  };

  /**
   * Sync control UI from cart drop-in data (Magento qty block visibility).
   *
   * @param {Object|null|undefined} cart
   * @return {void}
   */
  const syncFromCart = (cart) => {
    if (busy) {
      pendingCart = cart;
      return;
    }
    applyCartState(cart);
  };

  /**
   * After a successful add: show "Added", then reveal the qty stepper.
   *
   * @param {Object|null|undefined} cart
   * @return {void}
   */
  const showAddedThenQty = (cart) => {
    const item = findCartItemBySku(cart, product.sku);
    if (!item) {
      busy = false;
      applyCartState(cart);
      return;
    }

    pendingCart = cart;
    cartItemUid = item.uid;
    currentQty = item.quantity;
    setBusy(true, addedLabel);

    clearTimeout(addedTimer);
    addedTimer = setTimeout(() => {
      busy = false;
      applyCartState(pendingCart || cart);
      pendingCart = null;
      addedTimer = null;
    }, addedDelayMs);
  };

  /**
   * @param {number} targetQty
   * @return {Promise<void>}
   */
  const updateQuantity = async (targetQty) => {
    if (busy || !cartItemUid || typeof onUpdateQty !== 'function') return;
    const nextQty = Number.isFinite(targetQty) && targetQty > 0 ? targetQty : 0;
    setBusy(true);
    if ($qtyInput) $qtyInput.value = String(nextQty || currentQty);
    try {
      const cart = await onUpdateQty(cartItemUid, nextQty);
      busy = false;
      applyCartState(cart);
    } catch (error) {
      console.error('Error updating cart quantity', error);
      if ($qtyInput) $qtyInput.value = String(currentQty);
      setBusy(false);
    }
  };

  atcBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || atcBtn.disabled || typeof onAdd !== 'function') return;

    setBusy(true, addingLabel);
    try {
      const cart = await onAdd(product);
      if (!findCartItemBySku(cart, product.sku)) {
        busy = false;
        applyCartState(cart);
        return;
      }
      showAddedThenQty(cart);
    } catch (error) {
      console.error('Error adding product to cart', error);
      setBusy(false);
    }
  });

  $incBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    updateQuantity(currentQty + 1);
  });

  $decBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    updateQuantity(currentQty - 1);
  });

  $qtyInput?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  $qtyInput?.addEventListener('change', () => {
    const val = parseInt($qtyInput.value, 10);
    updateQuantity(Number.isNaN(val) || val < 0 ? 0 : val);
  });

  $qtyInput?.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
      $qtyInput.blur();
      return;
    }
    clearTimeout(qtyDebounceTimer);
    qtyDebounceTimer = setTimeout(() => {
      const val = parseInt($qtyInput.value, 10);
      if (!Number.isNaN(val)) {
        updateQuantity(val < 0 ? 0 : val);
      }
    }, 400);
  });

  actionsWrap.append(atcBtn, qtyBlock);
  actionsWrap.syncFromCart = syncFromCart;
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
