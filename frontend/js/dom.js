// Tiny element builder. Text always goes through textContent, never innerHTML,
// so model output can't inject markup.
export function el(cls, text, tag = 'div') {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}

export const isCompact = () => matchMedia('(max-width: 160px)').matches;
