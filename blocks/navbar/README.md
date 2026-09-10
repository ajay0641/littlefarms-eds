# AEM Edge Delivery Services Navigation Block (`navbar`)

This custom block serves as the single centralized navigation layer engine for the storefront application. It blends real-time cloud database categories acquired through unified GraphQL services with direct hardcoded layout override tables authored within `da.live` document fragments.

## 📂 Component Map Reference
```text
blocks/navbar/
├── renderers/
│   ├── desktopRenderer.js      # Processes horizontal flex layout mega menu frames
│   └── mobileRenderer.js       # Processes drawer accordion lists with gesture events
│
├── categoryQuery.js            # GraphQL document schema query string definition
├── categoryService.js          # Handles network acquisition, validations, and sorting
├── menuBuilder.js              # Blends GraphQL arrays with authored spreadsheet elements
├── navigationEvents.js         # Hub isolating lifecycle interface browser hooks
├── navbar.css                  # UI view design presentation rules styles
└── navbar.js                   # Main traffic controller dispatching operations