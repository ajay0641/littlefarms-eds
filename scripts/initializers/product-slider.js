import { initializers } from '@dropins/tools/initializer.js';
import { getHeaders } from '@dropins/tools/lib/aem/configs.js';
import { initialize, setEndpoint } from '@ajay0641/tfs-product-slider/api.js';
import { initializeDropin } from './index.js';
import { applyCatalogServiceHeaders, CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

await initializeDropin(async () => {
  // productSearch uses the Catalog Service GraphQL endpoint
  setEndpoint(CS_FETCH_GRAPHQL);

  const labels = await fetchPlaceholders('placeholders/product-slider.json');
  const langDefinitions = {
    default: {
      ...labels,
    },
  };

  const csHeaders = getHeaders('cs');

  await initializers.mountImmediately(initialize, {
    langDefinitions,
    storeViewCode: csHeaders['Magento-Store-View-Code'],
    websiteCode: csHeaders['Magento-Website-Code'],
    storeCode: csHeaders['Magento-Store-Code'],
  });

  // initialize() writes store headers onto the linked CS client and drops
  // Magento-Environment-Id / x-api-key. Restore the full config.json set.
  applyCatalogServiceHeaders();
})();
