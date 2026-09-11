# Product Relations Block (`product-relations`)

A high-performance, standardized Adobe Commerce (Magento) storefront component for **Adobe Commerce as a Cloud Service (ACCS)** built with **Edge Delivery Services (EDS)**.

This custom block pulls direct product-level data associations (**Related**, **Up-sell**, and **Cross-sell**) configured manually inside the Adobe Commerce / Magento Admin Panel, bypassing automated AI algorithm variations (Sensei Recommendations) to ensure absolute catalog layout accuracy.

---

## 📁 File Structure

Place these assets directly inside your repository layout environment under your active block registry directory:

```text
your-project-repository/
└── blocks/
    └── product-relations/
        ├── product-relations.css
        ├── product-relations.js
        └── README.md
```

---

## 🚀 Key Features & How It Works

1. **Context & SKU Resolution (PDP & Cart):**
   - **PDP Context:** Automatically resolves product SKU via helper utilities (`getProductSku()`), meta tags (`meta[name="product-sku"]`), or `pdp/data` event bus listeners.
   - **Cart Context (`crosssell`):** When on the Shopping Cart page or when no single PDP SKU is present, it dynamically retrieves active cart item SKUs from `@dropins/storefront-cart/api.js` cache and `cart/data` events.
2. **Dynamic Configuration Parsing:** Inspects authoring table key-value pairs to determine target relation strategy (`related`, `upsell`, or `crosssell`).
3. **Optional Title & Subtitle Authoring:** Supports optional author-defined `Title` and `SubTitle` configurations. If omitted, `Title` falls back to default relation headings while `SubTitle` remains blank.
4. **Dual GraphQL Data Source Architecture:**
   - **Catalog Service GraphQL (Primary):** Queries product `links` (`linkTypes`) for high-performance edge responses.
   - **Core GraphQL (Fallback):** Queries `related_products`, `upsell_products`, or `crosssell_products` if Catalog Service returns no results.
5. **Multi-SKU Aggregation & Smart Filtering:** Aggregates relations across multiple cart items while automatically filtering out products already in the user's cart and deduplicating results.
6. **Horizontal Scroll-Snap Slider:** Renders an accessible, responsive horizontal slider track with custom previous/next SVG arrow buttons, smooth scrolling, `ResizeObserver` tracking, and automatic button state updates.
7. **Conditional Unmounting:** If no product relations exist for the target SKU(s), the block completely hides itself (`display: none`) and its parent wrapper to prevent empty layout blocks or shifts.

---

## 📑 Content Authoring (Word / Google Docs / DA / UE)

Content creators can configure the block using simple key-value tables in authored documents:

### Standard Block Table Example
| product-relations | |
| :--- | :--- |
| Product Relations | related |
| Title | Related Product |
| SubTitle | Featured Collection |

### Relation Type Options
- **`related`**: Surfaces related alternatives (Default Title: *Related Products*).
- **`upsell`**: Surfaces premium item variations or upgrades (Default Title: *You May Also Like*).
- **`crosssell`**: Surfaces complementary add-ons on PDP or Cart page (Default Title: *Complete Your Order*).

### Authoring Keys
- **`Product Relations` / `Type` / `Relation`**: `related` | `upsell` | `crosssell`
- **`Title` / `Heading`** *(Optional)*: Custom section title text (e.g., `Related Product`).
- **`SubTitle` / `Subtitle`** *(Optional)*: Custom subtitle heading text (e.g., `test`).

---

## 💻 Technical Implementation Details

### 1. Catalog Service GraphQL Query (Primary)
```graphql
query GetProductRelationsCS($skus: [String!]!) {
  products(skus: $skus) {
    sku
    name
    links {
      linkTypes
      product {
        sku
        name
        urlKey
        images { url label roles }
        ... on SimpleProductView {
          price {
            regular { amount { value currency } }
            final { amount { value currency } }
          }
        }
        ... on ComplexProductView {
          priceRange {
            minimum {
              regular { amount { value currency } }
              final { amount { value currency } }
            }
          }
        }
      }
    }
  }
}
```

### 2. Adobe Commerce Core GraphQL Query (Fallback)
```graphql
query GetProductRelationsCore($skus: [String]!) {
  products(filter: { sku: { in: $skus } }) {
    items {
      sku
      crosssell_products { # or related_products / upsell_products
        sku
        name
        url_key
        small_image { url label }
        price_range {
          minimum_price {
            final_price { value currency }
            regular_price { value currency }
          }
        }
      }
    }
  }
}
```

### 3. Slider Track Mechanics (`setupSlider`)
- **Scroll Snap:** `.product-relations-grid` uses CSS `scroll-snap-type: x mandatory` with smooth horizontal scrolling.
- **Dynamic Navigation:** Previous (`.product-relations-prev`) and Next (`.product-relations-next`) arrow buttons disable automatically when reaching track bounds.
- **Resize & Image Load Handlers:** Monitors track dimensions via `ResizeObserver` and image `load` events to calculate max scroll distances accurately.

---

## 🛠️ Performance & UX Optimization Checklist
* **Lazy Loading:** Product thumbnails within cards use `loading="lazy"` to optimize PageSpeed and LCP metrics.
* **Dropin Integration:** Integrates with `@dropins/storefront-cart` for Add to Cart actions and `@dropins/storefront-wishlist` for interactive wishlist toggles.
* **Accessible HTML:** Uses proper heading hierarchy (`.product-relations-header`), descriptive SVG arrow labels (`aria-label`), and structured price markup.
* **Layout Shift Prevention:** Clears un-decorated author table content immediately upon block decoration and hides wrapper containers cleanly when empty.
