export function initializeNavigationEvents(blockElement) {
  // Scoped Desktop Hover Listeners
  const rootItems = blockElement.querySelectorAll('.navbar-desktop-viewport-view .level0');

  rootItems.forEach((item) => {
    item.addEventListener('mouseenter', () => {
      item.setAttribute('aria-expanded', 'true');
    });
    item.addEventListener('mouseleave', () => {
      item.setAttribute('aria-expanded', 'false');
    });

    item.addEventListener('focusin', () => {
      item.setAttribute('aria-expanded', 'true');
    });
    item.addEventListener('focusout', (e) => {
      if (!item.contains(e.relatedTarget)) {
        item.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // Scoped Escape Close Action
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      blockElement.querySelectorAll('[aria-expanded="true"]').forEach((el) => {
        el.setAttribute('aria-expanded', 'false');
      });
      blockElement.querySelectorAll('.mobile-nav__panel').forEach((p) => {
        p.style.display = 'none';
      });
    }
  });
}
