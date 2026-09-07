/**
 * Loads and decorates the footer.
 * Content-first: all copy, links, and images live in content/footer.plain.html.
 * This module fetches that fragment and renders the footer structure.
 * @param {Element} block The footer block element
 */

/**
 * Fetches the footer fragment DOM.
 * Metadata-independent dual-fetch: /content first (localhost / aem up),
 * then root (DA/EDS production, where the fragment is served at the site root).
 * @returns {Promise<Document|null>} parsed fragment document, or null on failure
 */
async function fetchFooterFragment() {
  let resp = await fetch('/content/footer.plain.html');
  if (!resp.ok) resp = await fetch('/footer.plain.html');
  if (!resp.ok) return null;
  const html = await resp.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * Builds the feature/promo row (icon + heading + description items).
 * Reads a section of alternating <p><img></p>, <h3>, <p> triples.
 * @param {Element} section The source section div
 * @returns {Element} decorated feature-row element
 */
function buildFeatureRow(section) {
  const row = document.createElement('div');
  row.className = 'footer-features';

  const nodes = [...section.children];
  let current = null;
  let text = null;
  nodes.forEach((node) => {
    const img = node.querySelector('img');
    if (node.tagName === 'P' && img) {
      current = document.createElement('div');
      current.className = 'footer-feature';
      current.append(img);
      text = document.createElement('div');
      text.className = 'footer-feature-text';
      current.append(text);
      row.append(current);
    } else if (node.tagName === 'H3' && text) {
      text.append(node);
    } else if (node.tagName === 'P' && text) {
      text.append(node);
    }
  });

  return row;
}

/**
 * Builds the primary link band from the columns section.
 * Each <h4> starts a column; the following <ul> holds its links.
 * The social column (links wrapping images) is tagged for icon styling.
 * @param {Element} section The source section div
 * @returns {Element} decorated link-columns element
 */
function buildLinkColumns(section) {
  const band = document.createElement('div');
  band.className = 'footer-links';

  const nodes = [...section.children];
  let column = null;
  nodes.forEach((node) => {
    if (node.tagName === 'H4') {
      column = document.createElement('div');
      column.className = 'footer-column';
      column.append(node);
      band.append(column);
    } else if (node.tagName === 'UL' && column) {
      if (node.querySelector('a img')) {
        column.classList.add('footer-social');
        node.querySelectorAll('a').forEach((a) => {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
        });
      }
      column.append(node);
    }
  });

  return band;
}

/**
 * Builds the bottom bar: copyright, payment icons, and site credit.
 * @param {Element} section The source section div
 * @returns {Element} decorated bottom-bar element
 */
function buildBottomBar(section) {
  const bar = document.createElement('div');
  bar.className = 'footer-bottom';
  while (section.firstElementChild) bar.append(section.firstElementChild);
  // external credit link opens in a new tab
  bar.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });
  return bar;
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const fragment = await fetchFooterFragment();
  block.textContent = '';
  if (!fragment) return;

  const sections = [...fragment.body.children].filter((el) => el.tagName === 'DIV');
  const footer = document.createElement('div');
  footer.className = 'footer-inner';

  if (sections[0]) footer.append(buildFeatureRow(sections[0]));
  if (sections[1]) footer.append(buildLinkColumns(sections[1]));
  if (sections[2]) footer.append(buildBottomBar(sections[2]));

  block.append(footer);
}
