import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-product-discovery/api.js';
import { initializeDropin } from './index.js';
import { applyCatalogServiceHeaders, CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

await initializeDropin(async () => {
  // Inherit Fetch GraphQL Instance (Catalog Service)
  setEndpoint(CS_FETCH_GRAPHQL);

  // Fetch placeholders
  const labels = await fetchPlaceholders('placeholders/search.json');
  const langDefinitions = {
    default: {
      ...labels,
      Search: {
        ...(labels.Search || {}),
        Facet: {
          ...(labels.Search?.Facet || {}),
          showMore: 'Show all',
          showLess: 'Show less',
        },
        SortBy: {
          ...(labels.Search?.SortBy || {}),
          title: 'Sort By',
        },
      },
    },
  };

  // Initialize search
  await initializers.mountImmediately(initialize, { langDefinitions });
  applyCatalogServiceHeaders();
})();
