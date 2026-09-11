import { fetchCommerceCategories } from './categoryService.js';
import { blendNavigationTrees } from './menuBuilder.js';
import { renderDesktopMenu } from './renderers/desktopRenderer.js';
import { renderMobileMenu } from './renderers/mobileRenderer.js';
import { initializeNavigationEvents } from './navigationEvents.js';

/**
 * Native AEM Navbar Block Entry Point.
 * Operates completely pluggable and context-decoupled across pages.
 */
export default async function decorate(block) {
  try {
    const rawPlaceholder = document.createElement('div');
    rawPlaceholder.innerHTML = block.innerHTML;

    block.textContent = '';
    block.classList.add('nav-sections-unified-mount');

    let commerceTree = [];
    try {
      commerceTree = await fetchCommerceCategories();
    } catch (apiError) {
      console.warn('Commerce network mesh dropped, processing local fallback trees:', apiError);
    }

    const finalTree = blendNavigationTrees(rawPlaceholder, commerceTree);

    const desktopContainer = document.createElement('div');
    desktopContainer.className = 'navbar-desktop-viewport-view';

    const mobileContainer = document.createElement('div');
    mobileContainer.className = 'navbar-mobile-viewport-view';

    renderDesktopMenu(finalTree, desktopContainer);
    renderMobileMenu(finalTree, mobileContainer);

    block.appendChild(desktopContainer);
    block.appendChild(mobileContainer);

    initializeNavigationEvents(block);
  } catch (error) {
    console.error('Critical failure establishing custom modular navbar block:', error);
  }
}
