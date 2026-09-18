import { render as provider } from '@dropins/storefront-cart/render.js';
import MiniCart from '@dropins/storefront-cart/containers/MiniCart.js';
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import {
  InLineAlert,
  Icon,
  provider as UI,
  Button,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';

import createModal from '../modal/modal.js';
import createMiniPDP from '../../scripts/components/commerce-mini-pdp/commerce-mini-pdp.js';
import { showRemoveCartItemConfirmModal } from '../../scripts/components/cart-confirm-modal/cart-confirm-modal.js';

// Initializers
import '../../scripts/initializers/cart.js';

import { readBlockConfig } from '../../scripts/aem.js';
import { fetchPlaceholders, rootLink, getProductLink } from '../../scripts/commerce.js';

export default async function decorate(block) {
  const {
    'start-shopping-url': startShoppingURL = '',
    'cart-url': cartURL = '',
    'checkout-url': _checkoutURL = '',
    'enable-updating-product': enableUpdatingProduct = 'false',
    'undo-remove-item': undo = 'false',
  } = readBlockConfig(block);

  // Get translations for custom messages
  const placeholders = await fetchPlaceholders();

  const MESSAGES = {
    ADDED: placeholders?.Global?.MiniCartAddedMessage,
    UPDATED: placeholders?.Global?.MiniCartUpdatedMessage,
  };

  // Modal state
  let currentModal = null;
  let currentCartNotification = null;

  // Create a container for the update message
  const updateMessage = document.createElement('div');
  updateMessage.className = 'commerce-mini-cart__update-message';

  // Create shadow wrapper
  const shadowWrapper = document.createElement('div');
  shadowWrapper.className = 'commerce-mini-cart__message-wrapper';
  shadowWrapper.appendChild(updateMessage);

  const showMessage = (message) => {
    updateMessage.textContent = message;
    updateMessage.classList.add('commerce-mini-cart__update-message--visible');
    shadowWrapper.classList.add('commerce-mini-cart__message-wrapper--visible');
    setTimeout(() => {
      updateMessage.classList.remove(
        'commerce-mini-cart__update-message--visible',
      );
      shadowWrapper.classList.remove(
        'commerce-mini-cart__message-wrapper--visible',
      );
    }, 3000);
  };

  // Handle Edit Button Click
  async function handleEditButtonClick(cartItem) {
    try {
      // Create mini PDP content
      const miniPDPContent = await createMiniPDP(
        cartItem,
        async (_updateData) => {
          const productName = cartItem.name
            || cartItem.product?.name
            || placeholders?.Global?.CartUpdatedProductName;
          const message = placeholders?.Global?.CartUpdatedProductMessage?.replace(
            '{product}',
            productName,
          );

          // Show message in the main cart page
          const cartNotification = document.querySelector(
            '.cart__notification',
          );
          if (cartNotification) {
            // Clear any existing cart notifications
            currentCartNotification?.remove();

            currentCartNotification = await UI.render(InLineAlert, {
              heading: message,
              type: 'success',
              variant: 'primary',
              icon: h(Icon, { source: 'CheckWithCircle' }),
              'aria-live': 'assertive',
              role: 'alert',
              onDismiss: () => {
                currentCartNotification?.remove();
              },
            })(cartNotification);

            // Auto-dismiss after 5 seconds
            setTimeout(() => {
              currentCartNotification?.remove();
            }, 5000);
          }

          // Also trigger message in the mini-cart
          showMessage(message);
        },
        () => {
          if (currentModal) {
            currentModal.removeModal();
            currentModal = null;
          }
        },
      );

      currentModal = await createModal([miniPDPContent]);

      if (currentModal.block) {
        currentModal.block.setAttribute('id', 'mini-pdp-modal');
      }

      currentModal.showModal();
    } catch (error) {
      console.error('Error opening mini PDP modal:', error);

      // Show error message using mini-cart's message system
      showMessage(
        placeholders?.Global?.ProductLoadError,
      );
    }
  }

  // Add event listeners for cart updates
  events.on('cart/product/added', () => showMessage(MESSAGES.ADDED), {
    eager: true,
  });
  events.on('cart/product/updated', () => showMessage(MESSAGES.UPDATED), {
    eager: true,
  });

  // Prevent mini cart from closing when undo is enabled
  if (undo === 'true') {
    // Add event listener to prevent event bubbling from remove buttons
    block.addEventListener('click', (e) => {
      // Check if click is on a remove button or within an undo-related element
      const isRemoveButton = e.target.closest('[class*="remove"]')
        || e.target.closest('[data-testid*="remove"]')
        || e.target.closest('[class*="undo"]')
        || e.target.closest('[data-testid*="undo"]');

      if (isRemoveButton) {
        // Stop the event from bubbling up to document level
        e.stopPropagation();
      }
    });
  }

  block.innerHTML = '';

  function getCartItemLabels(item) {
    const attrs = item?.productAttributes || item?.product?.custom_attributesV2?.items || [];
    const match = attrs.find((attr) => {
      const code = String(attr?.code || attr?.name || attr?.id || '')
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
      return code === 'productlabel';
    });
    const selected = match?.selected_options;
    let rawVal = null;
    if (Array.isArray(selected) && selected.length > 0) {
      rawVal = selected.map((o) => o?.label || o?.value);
    } else if (match?.value != null) {
      rawVal = match.value;
    } else if (item?.product_label != null) {
      rawVal = item.product_label;
    }
    if (!rawVal) return [];
    let labelsList = [];
    if (Array.isArray(rawVal)) {
      labelsList = rawVal
        .map((v) => (typeof v === 'object' ? (v?.label || v?.value) : v))
        .flatMap((v) => (typeof v === 'string' ? v.split(',') : [String(v)]))
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (typeof rawVal === 'string') {
      labelsList = rawVal
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [...new Set(labelsList)];
  }

  function createCartItemBadges(item) {
    const itemLabels = getCartItemLabels(item);
    if (!itemLabels.length) return null;

    const labelsWrap = document.createElement('div');
    labelsWrap.className = 'product-item-labels minicart-item-labels';

    itemLabels.forEach((lbl) => {
      const badge = document.createElement('div');
      badge.className = 'product-item-label minicart-item-label';
      badge.textContent = lbl;
      labelsWrap.append(badge);
    });

    return labelsWrap;
  }

  // Render MiniCart
  const createProductLink = (product) => getProductLink(product.url.urlKey, product.topLevelSku);
  await provider.render(MiniCart, {
    routeEmptyCartCTA: startShoppingURL ? () => rootLink(startShoppingURL) : undefined,
    routeCart: cartURL ? () => rootLink(cartURL) : () => rootLink('/cart'),
    routeCheckout: () => rootLink(cartURL || '/cart'),
    routeProduct: createProductLink,
    undo: undo === 'true',
    enableQuantityUpdate: true,
    enableItemRemoval: true,
    hideHeading: true,

    slots: {
      Thumbnail: (ctx) => {
        const { item, defaultImageProps } = ctx;
        const anchorWrapper = document.createElement('a');
        anchorWrapper.className = 'minicart-item-photo';
        anchorWrapper.href = createProductLink(item);

        const imageContainer = document.createElement('span');
        imageContainer.className = 'minicart-item-image-wrapper';

        const fakeCtx = {
          replaceWith: (el) => {
            anchorWrapper.prepend(el);
            const badges = createCartItemBadges(item);
            if (badges) {
              anchorWrapper.append(badges);
            }
            ctx.replaceWith(anchorWrapper);
          },
        };

        tryRenderAemAssetsImage(fakeCtx, {
          alias: item.sku,
          imageProps: defaultImageProps,
          wrapper: imageContainer,

          params: {
            width: defaultImageProps.width || 80,
            height: defaultImageProps.height || 80,
          },
        });

        if (item?.itemType === 'ConfigurableCartItem' && enableUpdatingProduct === 'true') {
          const editLinkContainer = document.createElement('div');
          editLinkContainer.className = 'cart-item-edit-container';

          const editLink = document.createElement('div');
          editLink.className = 'cart-item-edit-link';

          UI.render(Button, {
            children: placeholders?.Global?.CartEditButton,
            // Every cart item renders its own Edit button, so the accessible
            // name must include the product name to distinguish them.
            'aria-label': `${placeholders?.Global?.CartEditButton} ${item.name}`,
            variant: 'tertiary',
            size: 'medium',
            icon: h(Icon, { source: 'Edit' }),
            onClick: () => handleEditButtonClick(item),
          })(editLink);

          editLinkContainer.appendChild(editLink);
          ctx.appendChild(editLinkContainer);
        }
      },

      ItemQuantity: (ctx) => {
        let currentItem = ctx.item;
        const { handleItemQuantityUpdate } = ctx;
        const isCurrentlyUpdating = Boolean(
          ctx.itemsLoading && ctx.itemsLoading.has(currentItem.uid),
        );

        const container = document.createElement('div');
        container.className = `addtocart-qty-block ${isCurrentlyUpdating ? 'is-updating' : ''}`;

        const decBtn = document.createElement('button');
        decBtn.type = 'button';
        decBtn.className = 'action decrease';
        decBtn.setAttribute(
          'aria-label',
          placeholders?.Cart?.CartItem?.decreaseQuantity || 'Decrease quantity',
        );
        if (isCurrentlyUpdating) {
          decBtn.disabled = true;
        }
        decBtn.innerHTML = '<span class="minus"></span>';

        const qtyWrapper = document.createElement('div');
        qtyWrapper.className = 'input-text qty';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.value = currentItem.quantity;
        input.className = 'input-text';
        input.readOnly = true;
        if (isCurrentlyUpdating) input.disabled = true;
        input.setAttribute(
          'aria-label',
          placeholders?.Dropin?.CartItem?.quantity?.label || 'Quantity',
        );

        qtyWrapper.append(input);

        const incBtn = document.createElement('button');
        incBtn.type = 'button';
        incBtn.className = 'action increase';
        incBtn.setAttribute(
          'aria-label',
          placeholders?.Cart?.CartItem?.increaseQuantity || 'Increase quantity',
        );
        if (isCurrentlyUpdating) incBtn.disabled = true;
        incBtn.innerHTML = '<span class="plus"></span>';

        const setUpdating = (updating) => {
          decBtn.disabled = updating;
          incBtn.disabled = updating;
          input.disabled = updating;
          if (updating) {
            container.classList.add('is-updating');
          } else {
            container.classList.remove('is-updating');
          }
        };

        const updateItemState = (item, loading) => {
          currentItem = item;
          input.value = item.quantity;
          setUpdating(loading);
        };

        if (typeof ctx.onChange === 'function') {
          ctx.onChange((nextCtx) => {
            const nextItem = nextCtx?.item || currentItem;
            const loading = Boolean(
              nextCtx?.itemsLoading && nextCtx.itemsLoading.has(nextItem.uid),
            );
            updateItemState(nextItem, loading);
          });
        }

        const cartUnsub = events.on('cart/data', (cartData) => {
          if (!container.isConnected) {
            cartUnsub?.off?.();
            return;
          }
          const found = cartData?.items?.find((it) => it.uid === currentItem.uid);
          if (found) {
            updateItemState(found, false);
          }
        });

        decBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (decBtn.disabled) return;

          if (currentItem.quantity <= 1) {
            showRemoveCartItemConfirmModal({
              onConfirm: () => {
                setUpdating(true);
                handleItemQuantityUpdate(currentItem, 0, true);
              },
            });
          } else {
            setUpdating(true);
            handleItemQuantityUpdate(currentItem, currentItem.quantity - 1);
          }
        });

        incBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (incBtn.disabled) return;

          setUpdating(true);
          handleItemQuantityUpdate(currentItem, currentItem.quantity + 1);
        });

        container.append(decBtn, qtyWrapper, incBtn);
        ctx.replaceWith(container);
      },

      ItemRemoveAction: (ctx) => {
        let currentItem = ctx.item;
        const { handleItemQuantityUpdate } = ctx;
        const isCurrentlyUpdating = Boolean(
          ctx.itemsLoading && ctx.itemsLoading.has(currentItem.uid),
        );

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dropin-cart-item__remove';
        btn.setAttribute('aria-label', `Remove ${currentItem.name} from cart`);
        btn.setAttribute('data-testid', 'cart-item-remove-button');
        if (isCurrentlyUpdating) btn.disabled = true;
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="17.5" height="20" viewBox="0 0 17.5 20" fill="currentColor">
            <path d="M16.875,1.25H12.187L11.82.519A.937.937,0,0,0,10.98,0H6.516a.927.927,0,0,0-.836.52l-.367.73H.625A.625.625,0,0,0,0,1.875v1.25a.625.625,0,0,0,.625.625h16.25a.625.625,0,0,0,.625-.625V1.875A.625.625,0,0,0,16.875,1.25ZM2.078,18.242A1.875,1.875,0,0,0,3.949,20h9.6a1.875,1.875,0,0,0,1.871-1.758L16.25,5h-15Z"/>
          </svg>
        `;

        if (typeof ctx.onChange === 'function') {
          ctx.onChange((nextCtx) => {
            if (nextCtx?.item) currentItem = nextCtx.item;
            btn.disabled = Boolean(
              nextCtx?.itemsLoading && nextCtx.itemsLoading.has(currentItem.uid),
            );
          });
        }

        const cartUnsub = events.on('cart/data', () => {
          if (!btn.isConnected) {
            cartUnsub?.off?.();
            return;
          }
          btn.disabled = false;
        });

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (btn.disabled) return;

          showRemoveCartItemConfirmModal({
            onConfirm: () => {
              btn.disabled = true;
              handleItemQuantityUpdate(currentItem, 0, true);
            },
          });
        });

        ctx.replaceWith(btn);
      },
    },
  })(block);

  // Find the products container and add the message div at the top
  const productsContainer = block.querySelector('.cart-mini-cart__products');
  if (productsContainer) {
    productsContainer.insertBefore(shadowWrapper, productsContainer.firstChild);
  } else {
    console.info('Products container not found, appending message to block');
    block.appendChild(shadowWrapper);
  }

  // Ensure footer buttons match design: "View Cart & checkout" and "Continue shopping"
  const updateFooterButtons = () => {
    const checkoutBtn = block.querySelector('[data-testid="route-checkout-button"]');
    if (checkoutBtn) {
      if (checkoutBtn.textContent !== 'View Cart & checkout') {
        checkoutBtn.textContent = 'View Cart & checkout';
      }
      const targetCartHref = rootLink(cartURL || '/cart');
      if (checkoutBtn.getAttribute('href') !== targetCartHref) {
        checkoutBtn.setAttribute('href', targetCartHref);
      }
    }
    const cartBtn = block.querySelector('[data-testid="route-cart-button"]');
    if (cartBtn && cartBtn.textContent !== 'Continue shopping') {
      cartBtn.textContent = 'Continue shopping';
      cartBtn.removeAttribute('href');
      cartBtn.setAttribute('role', 'button');
    }
  };

  const footerObserver = new MutationObserver(updateFooterButtons);
  footerObserver.observe(block, { childList: true, subtree: true });
  updateFooterButtons();

  block.addEventListener('click', (e) => {
    const continueShoppingBtn = e.target.closest('[data-testid="route-cart-button"]');
    if (continueShoppingBtn) {
      e.preventDefault();
      e.stopPropagation();
      document.querySelector('.minicart-backdrop')?.click();
    }
  });

  return block;
}
