import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@ajay0641/tfs-product-slider/api.js';
import { initializeDropin } from './index.js';
import { CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

await initializeDropin(async () => {
  // productSearch uses the Catalog Service GraphQL endpoint
  setEndpoint(CS_FETCH_GRAPHQL);

  const labels = await fetchPlaceholders('placeholders/product-slider.json');
  const langDefinitions = {
    default: {
      ...labels,
    },
  };

  return initializers.mountImmediately(initialize, { langDefinitions });
})();
