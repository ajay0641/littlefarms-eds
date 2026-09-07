# TFS Product Slider Block

## Overview

The TFS Product Slider block renders a horizontal product carousel using the `@ajay0641/tfs-product-slider` drop-in `ProductSliderContainer`. Products are loaded from Adobe Commerce **Catalog Service** via `productSearch` (default filter: `isNew = 1`).

## Integration

### Block Configuration

| Configuration Key | Type | Default | Description | Required |
|-------------------|------|---------|-------------|----------|
| `title` | string | `''` | Heading above the slider | No |
| `phrase` | string | `''` | Catalog Service search phrase | No |
| `page-size` | string/number | `8` | Number of products to fetch | No |
| `current-page` | string/number | `1` | productSearch page | No |
| `attribute` | string | `isNew` | Catalog Service filter attribute | No |
| `eq` | string | `1` | Filter equality value | No |

Legacy keys `filter-attribute` / `filter-eq` are still supported.

### Authoring examples

**New products (default):**

| tfs-product-slider | |
| --- | --- |
| attribute | isNew |
| eq | 1 |

**Category products (second homepage slider):**

| tfs-product-slider | |
| --- | --- |
| attribute | categoryIds |
| eq | 6 |

Each instance uses the same Catalog Service `productSearch` call with a different `filter` clause. Empty filter fields keep the default `isNew = 1`.

<!-- ### URL Parameters

No URL parameters directly affect this block's behavior. -->

<!-- ### Local Storage

No localStorage keys are used by this block. -->

### Events

#### Event Listeners

No direct event listeners are implemented in this block.

#### Event Emitters

Events are emitted by the drop-in (not the block wrapper):

- `product-slider/data` — result payload after products load
- `product-slider/error` — `{ message }` when the fetch fails
- `product-slider/product-click` — `{ product, target }` when image/name is clicked
- `product-slider/add-to-cart` — `{ product }` when the cart icon is clicked (before the storefront handler runs)

## Behavior Patterns

### Page Context Detection

- **All pages**: Renders a product slider wherever authors place **TFS Product Slider**
- **Authoring**: Key/value rows for title, phrase, page size, and filter; empty block uses drop-in defaults (isNew products). Set `attribute` / `eq` per instance for different product sets (e.g. `categoryIds` / `6`)

### User Interaction Flows

1. **Initialization**: Block loads product-slider + cart initializers, then mounts the drop-in
2. **Fetch**: Calls Catalog Service `productSearch` with authored phrase/pageSize/filter (or defaults)
3. **PDP links**: Block remaps product URLs to storefront routes via `getProductLink(urlKey, sku)` (`/products/{urlKey}/{sku}`)
4. **Navigation**: Users scroll the track or use previous/next controls when more than one product is present
5. **Product open**: Image/name click navigates to the product detail page
6. **Add to cart**: Cart icon calls storefront `onAddToCart` → `@dropins/storefront-cart` `addProductsToCart([{ sku, quantity: 1 }])`. Complex / not-allowed products redirect to PDP instead. While the request runs, the clicked icon shows a loading spinner (`is-loading`)
7. **Add to wishlist**: Heart icon calls storefront `onAddToWishlist` → `@dropins/storefront-wishlist` toggle via `addProductsToWishlist` / `removeProductsFromWishlist` (same pattern as PLP). Active state uses `is-active` on the button

### Styling note

All TFS card/slider visual design lives in **`blocks/tfs-product-slider/tfs-product-slider.css`**, not in the npm drop-in. After upgrading `@ajay0641/tfs-product-slider`, run `npm run install:dropins` and verify class names still match (e.g. `__action-btn`, `__wishlist`). Update block CSS if the drop-in DOM changes — storefront styles are not overwritten by drop-in updates.

### Error Handling

- **API Errors**: GraphQL/network failures show container error copy and emit `product-slider/error`
- **Empty results**: Container shows empty status message
- **Add to cart errors**: Logged to the console; cart drop-in owns user-facing cart state
- **Placeholder Fetch Errors**: Missing `placeholders/product-slider.json` falls back to drop-in default labels
- **Invalid page size**: Non-numeric page size falls back to `8`

### Drop-in Dependency

| Package | Path after install |
|---------|-------------------|
| `@ajay0641/tfs-product-slider` | `scripts/__dropins__/tfs-product-slider/` (copied by `postinstall.js`) |

Import map entry (in `head.html`): `@ajay0641/tfs-product-slider/` → `/scripts/__dropins__/tfs-product-slider/`

After upgrading the npm package, run:

```bash
npm run install:dropins
```
