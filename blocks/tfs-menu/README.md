# TFS Menu Block

Renders a category navigation menu using the `@ajay0641/tfs-menu` drop-in `MenuContainer`. Categories are loaded from Adobe Commerce **Catalog Service** via the `categories` GraphQL query.

## Authoring (DA)

Add a **TFS Menu** block to any section. Configure:

| Field | Description |
|-------|-------------|
| `parent-id` | Root category ID for the menu tree (default `2`) |

Category links are rewritten client-side to `/categories/{urlPath}/{categoryId}`. When folder mapping is not configured on the environment, `scripts/scripts.js` redirects those URLs to `/categories/default?cp=...` so the PLP template can load the correct category.

Example:

| parent-id |
|-----------|
| 2 |

## Dependencies

| Package | Location |
|---------|----------|
| `@ajay0641/tfs-menu` | `scripts/__dropins__/tfs-menu/` (copied by `postinstall.js`) |

Import map entry (in `head.html`): `@ajay0641/tfs-menu/` → `/scripts/__dropins__/tfs-menu/`

After upgrading the npm package, run `npm run install:dropins`.
