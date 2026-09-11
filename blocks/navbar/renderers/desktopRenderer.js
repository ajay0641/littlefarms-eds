/**
 * Desktop Hierarchical Layout Renderer.
 * Mounts full hover mega menus offline using DocumentFragments to optimize CLS.
 * @param {Array} unifiedTree - Blended data tree from menuBuilder.
 * @param {Element} container - Target mount frame element.
 */
export function renderDesktopMenu(unifiedTree, container) {
  container.innerHTML = '';

  const rootUl = document.createElement('ul');
  rootUl.className = 'nav-top-level-list';

  unifiedTree.forEach((level0) => {
    const li0 = document.createElement('li');
    li0.className = 'level0';

    const a0 = document.createElement('a');

    // Ensure the path fallback handles missing values safely
    let targetUrl = level0.url_path || '#';
    if (targetUrl !== '#' && !targetUrl.startsWith('/') && !targetUrl.startsWith('http')) {
      targetUrl = `/${targetUrl}`;
    }

    a0.href = targetUrl;
    a0.textContent = level0.name;
    li0.appendChild(a0);

    if (level0.children && level0.children.length > 0) {
      li0.classList.add('nav-drop');

      const subUl = document.createElement('ul');
      subUl.className = 'submenu';

      level0.children.forEach((level1) => {
        const li1 = document.createElement('li');
        const a1 = document.createElement('a');

        let childUrl = level1.url_path || '#';
        if (childUrl !== '#' && !childUrl.startsWith('/') && !childUrl.startsWith('http')) {
          childUrl = `/${childUrl}`;
        }

        a1.href = childUrl;
        a1.textContent = level1.name;
        li1.appendChild(a1);
        subUl.appendChild(li1);
      });

      li0.appendChild(subUl);
    }

    rootUl.appendChild(li0);
  });

  const desktopWrapper = document.createElement('div');
  desktopWrapper.className = 'navigation-desktop-wrapper';
  desktopWrapper.appendChild(rootUl);
  container.appendChild(desktopWrapper);
}
