import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@ajay0641/tfs-menu/api.js';
import { initializeDropin } from './index.js';
import { CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

await initializeDropin(async () => {
  // categories query uses the Catalog Service GraphQL endpoint
  setEndpoint(CS_FETCH_GRAPHQL);

  const labels = await fetchPlaceholders('placeholders/menu.json');
  const langDefinitions = {
    default: {
      ...labels,
    },
  };

  return initializers.mountImmediately(initialize, { langDefinitions });
})();
