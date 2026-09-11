/**
 * Mobile Accordion Drawer Layout Renderer.
 * @param {Array} unifiedTree - Blended data tree from menuBuilder.
 * @param {Element} container - Target mount frame element.
 */
export function renderMobileMenu(unifiedTree, container) {
  container.innerHTML = '';

  const drawer = document.createElement('div');
  drawer.className = 'mobile-nav';
  drawer.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'mobile-nav__body';

  const rootUl = document.createElement('ul');
  rootUl.className = 'mobile-accordion-root mobile-nav__list';

  unifiedTree.forEach((level0) => {
    const li0 = document.createElement('li');
    const hasChildren = level0.children && level0.children.length > 0;
    li0.className = hasChildren ? 'mobile-nav__item mobile-nav__item--has-children' : 'mobile-nav__item';

    const trigger = document.createElement('a');

    let targetUrl = level0.url_path || '#';
    if (targetUrl !== '#' && !targetUrl.startsWith('/') && !targetUrl.startsWith('http')) {
      targetUrl = `/${targetUrl}`;
    }

    trigger.href = targetUrl;
    trigger.textContent = level0.name;
    li0.appendChild(trigger);

    if (hasChildren) {
      li0.classList.add('nav-drop');
      const panel = document.createElement('ul');
      panel.className = 'mobile-nav__panel';
      panel.style.display = 'none';

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
        panel.appendChild(li1);
      });

      li0.appendChild(panel);

      trigger.addEventListener('click', (event) => {
        // Prevent default navigation so it handles the accordion expansion instead
        event.preventDefault();
        event.stopPropagation();

        const expanded = li0.getAttribute('aria-expanded') === 'true';

        // Toggle the current panel independently (Allows multiple panels to stay open)
        li0.classList.toggle('is-active', !expanded);
        li0.setAttribute('aria-expanded', !expanded ? 'true' : 'false');
        panel.style.display = !expanded ? 'block' : 'none';
      });
    }

    rootUl.appendChild(li0);
  });

  body.appendChild(rootUl);
  drawer.appendChild(body);
  container.appendChild(drawer);
}
