// Extract readable text from the current screen's DOM for TTS.
// Only processes the #content area — status bar and softkeys are excluded.

const MAX_CHARS = 2000;

/**
 * Walk the visible DOM inside `contentEl` and join all text into a single
 * readable string suitable for TTS synthesis.
 *
 * @param {HTMLElement} contentEl  The #content element.
 * @returns {string}  Plain text, trimmed and capped at MAX_CHARS.
 */
export function extractScreenText(contentEl) {
  if (!contentEl) return '';

  const lines = [];
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip hidden elements.
      const el = node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
      // Skip empty text nodes.
      if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    lines.push(walker.currentNode.textContent.trim());
  }

  // Deduplicate consecutive identical lines (e.g. repeated list markers).
  const deduped = [];
  for (const line of lines) {
    if (line !== deduped[deduped.length - 1]) deduped.push(line);
  }

  return deduped.join('. ').slice(0, MAX_CHARS);
}
