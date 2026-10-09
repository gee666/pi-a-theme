// Text hit testing uses layout rectangles, not painted pixels. That includes
// spaces between letters while excluding the unused width/padding of a block.
(() => {
  'use strict';
  const contains = (rect, x, y) => rect.width > 0 && rect.height > 0
    && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;

  function inheritedRole(element, root, attribute) {
    for (let node = element; node; node = node.parentElement) {
      const role = node.getAttribute(attribute);
      if (role) return role;
      if (node === root) break;
    }
    return null;
  }

  function isUnclipped(element, root, x, y) {
    const view = root.ownerDocument.defaultView;
    for (let node = element; node; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      const rect = node.getBoundingClientRect();
      if (style.overflowX !== 'visible' && (x < rect.left + node.clientLeft
        || x >= rect.left + node.clientLeft + node.clientWidth)) return false;
      if (style.overflowY !== 'visible' && (y < rect.top + node.clientTop
        || y >= rect.top + node.clientTop + node.clientHeight)) return false;
      if (node === root) break;
    }
    return true;
  }

  function hitTest(root, x, y) {
    const document = root.ownerDocument;
    const target = document.elementFromPoint(x, y);
    if (!target || !root.contains(target)) return null;
    const walker = document.createTreeWalker(target, 4); // NodeFilter.SHOW_TEXT
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.length || !isUnclipped(node.parentElement, root, x, y)) continue;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (contains(rect, x, y)) {
          const role = inheritedRole(node.parentElement, root, 'data-theme-fg');
          if (role) return { role, kind: 'text' };
        }
      }
    }

    for (let node = target; node; node = node.parentElement) {
      const style = document.defaultView.getComputedStyle(node);
      for (const rect of node.getClientRects()) {
        if (!contains(rect, x, y)) continue;
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          const role = node.getAttribute(`data-theme-border-${side.toLowerCase()}`)
            || node.getAttribute('data-theme-border');
          const width = parseFloat(style[`border${side}Width`]) || 0;
          if (!role || !width || ['none', 'hidden'].includes(style[`border${side}Style`])) continue;
          const distance = { Top: y - rect.top, Right: rect.right - x,
            Bottom: rect.bottom - y, Left: x - rect.left }[side];
          if (distance <= width) return { role, kind: 'border' };
        }
      }
      // An opaque child fill covers all ancestor borders and fills.
      const role = node.getAttribute('data-theme-bg');
      if (role) return { role, kind: 'background' };
      if (node === root) break;
    }
    return null;
  }

  globalThis.PiPreview = Object.freeze({ hitTest });
})();
