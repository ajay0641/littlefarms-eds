/**
 * Hardened parsing utility that blends dynamic GraphQL structures with authored documents.
 * Custom-built to handle exact text/link nodes and strictly formats URLs to absolute root paths.
 * @param {Element} placeholderBlock - The native AEM block containing inner layout cells.
 * @param {Array} commerceTree - Sorted array of categories from GraphQL.
 * @returns {Array} Fully combined structural tree model.
 */
export function blendNavigationTrees(placeholderBlock, commerceTree = []) {
  const unifiedMenu = JSON.parse(JSON.stringify(commerceTree));

  const rootUl = placeholderBlock.querySelector('ul');
  if (!rootUl) return unifiedMenu;

  const authoredItems = rootUl.querySelectorAll(':scope > li');

  authoredItems.forEach((item) => {
    const pEl = item.querySelector(':scope > p');
    const linkEl = pEl ? pEl.querySelector('a') : item.querySelector(':scope > a');

    let name = '';
    if (linkEl) {
      name = linkEl.textContent.trim();
    } else if (pEl) {
      name = pEl.textContent.trim();
    } else {
      name = item.firstChild?.textContent.trim() || '';
    }

    if (!name) return;

    // Strict formatting logic to fix url stacking anomalies on authored elements
    let urlPath = linkEl ? linkEl.getAttribute('href') || '#' : '#';
    if (urlPath !== '#' && !urlPath.startsWith('/') && !urlPath.startsWith('http')) {
      urlPath = `/categories/${urlPath}`;
    }

    const subList = item.querySelector('ul');
    const children = [];

    if (subList) {
      subList.querySelectorAll(':scope > li').forEach((subItem) => {
        const subLink = subItem.querySelector('a');

        const childName = subLink ? subLink.textContent.trim() : subItem.textContent.trim();
        let childUrl = subLink ? subLink.getAttribute('href') || '#' : '#';

        // Enforce categories absolute paths on relative manual child nodes
        if (childUrl !== '#' && !childUrl.startsWith('/') && !childUrl.startsWith('http')) {
          childUrl = `/categories/${childUrl}`;
        }

        if (childName) {
          children.push({
            id: `custom-${Math.random().toString(36).substring(2, 7)}`,
            name: childName,
            url_path: childUrl,
            isCustom: true,
            children: [],
          });
        }
      });
    }

    const existingIndex = unifiedMenu.findIndex(
      (cat) => cat.name.toLowerCase() === name.toLowerCase(),
    );

    if (existingIndex !== -1) {
      if (children.length > 0) {
        unifiedMenu[existingIndex].children = [
          ...(unifiedMenu[existingIndex].children || []),
          ...children,
        ];
      }
    } else {
      unifiedMenu.push({
        id: `custom-${Math.random().toString(36).substring(2, 7)}`,
        name,
        url_path: urlPath,
        isCustom: true,
        children,
      });
    }
  });

  return unifiedMenu;
}
