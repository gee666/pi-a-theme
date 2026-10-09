import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../src/preview.js', import.meta.url), 'utf8');
const rect = (left, top, width, height) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});
const defaultStyle = {
  display: 'block', visibility: 'visible', overflowX: 'visible', overflowY: 'visible',
  ...Object.fromEntries(['Top', 'Right', 'Bottom', 'Left'].flatMap(side => [
    [`border${side}Width`, '0px'], [`border${side}Style`, 'none'],
  ])),
};

// Layout is supplied explicitly. Range rectangles describe text advances, not
// glyph pixels. elementFromPoint supplies the browser's visible target; it can
// be an ancestor whose subtree also contains clipped or hidden text.
function fixture({ fg = 'text', bg = 'terminal' } = {}) {
  const calls = { points: [], walks: [], ranges: [] };
  const document = {
    target: null,
    defaultView: { getComputedStyle: element => element.computedStyle },
    elementFromPoint(x, y) { calls.points.push([x, y]); return this.target; },
    createTreeWalker(target, mask) {
      assert.equal(mask, 4, 'Walk text nodes, not element boxes');
      calls.walks.push(target);
      const nodes = [];
      const visit = element => {
        for (const child of element.children) {
          if (child.nodeType === 3) nodes.push(child);
          else visit(child);
        }
      };
      visit(target);
      let index = 0;
      return { nextNode: () => nodes[index++] ?? null };
    },
    createRange() {
      let selected;
      return {
        selectNodeContents(node) {
          assert.equal(node.nodeType, 3);
          selected = node;
          calls.ranges.push(node);
        },
        getClientRects() { assert.ok(selected); return selected.rects; },
      };
    },
  };
  function element(parent, options = {}) {
    const { fg, bg, border, attrs = {}, rects = [rect(20, 20, 200, 100)], style = {} } = options;
    const attributes = { ...attrs };
    if (fg !== undefined) attributes['data-theme-fg'] = fg;
    if (bg !== undefined) attributes['data-theme-bg'] = bg;
    if (border !== undefined) attributes['data-theme-border'] = border;
    const bounds = rect(
      Math.min(...rects.map(r => r.left)), Math.min(...rects.map(r => r.top)),
      Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)),
      Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top)),
    );
    const node = {
      nodeType: 1, ownerDocument: document, parentElement: parent, children: [],
      computedStyle: { ...defaultStyle, ...style },
      clientLeft: options.clientLeft ?? 0, clientTop: options.clientTop ?? 0,
      clientWidth: options.clientWidth ?? bounds.width,
      clientHeight: options.clientHeight ?? bounds.height,
      getAttribute: name => attributes[name] ?? null,
      getBoundingClientRect: () => bounds,
      getClientRects: () => rects,
      contains(other) {
        for (let current = other; current; current = current.parentElement) {
          if (current === this) return true;
        }
        return false;
      },
    };
    if (parent) parent.children.push(node);
    return node;
  }
  function text(parent, textContent, rects) {
    const node = { nodeType: 3, parentElement: parent, textContent, rects };
    parent.children.push(node);
    return node;
  }
  const root = element(null, { fg, bg, rects: [rect(0, 0, 400, 400)] });
  const context = createContext({});
  runInContext(source, context, { filename: 'src/preview.js', timeout: 1000 });
  return {
    root, document, element, text, calls, api: context.PiPreview,
    hit(target, x, y) {
      document.target = target;
      const result = context.PiPreview.hitTest(root, x, y);
      return result === null ? null : JSON.parse(JSON.stringify(result));
    },
  };
}
const textHit = role => ({ role, kind: 'text' });
const backgroundHit = role => ({ role, kind: 'background' });
const borderHit = role => ({ role, kind: 'border' });

test('classic preview script exposes a frozen hitTest API without touching the DOM at load', () => {
  const { api } = fixture();
  assert.deepEqual(Object.keys(api), ['hitTest']);
  assert.equal(typeof api.hitTest, 'function');
  assert.equal(Object.isFrozen(api), true);
});

test('null targets and elements outside the preview do not create ranges or walk text', () => {
  const f = fixture();
  const outside = f.element(null, { fg: 'accent', bg: 'selectedBg' });
  f.text(outside, 'overlay', [rect(20, 20, 60, 12)]);
  for (const target of [null, outside]) assert.equal(f.hit(target, 30, 25), null);
  assert.deepEqual(f.calls.points, [[30, 25], [30, 25]]);
  assert.deepEqual(f.calls.walks, []);
  assert.deepEqual(f.calls.ranges, []);
});

test('text advance rectangles include spaces and gaps between glyph ink', () => {
  const f = fixture();
  const panel = f.element(f.root, { fg: 'userMessageText', bg: 'userMessageBg' });
  const node = f.text(panel, 'a b', [rect(40, 40, 30, 14)]);
  // Assume ink at 41-46 and 63-68. Neither kerning gaps nor the space
  // need a painted-pixel hit to select the text role.
  for (const x of [40, 43, 48, 54, 61, 69.9]) {
    assert.deepEqual(f.hit(panel, x, 45), textHit('userMessageText'));
  }
  assert.ok(f.calls.ranges.every(selected => selected === node));
  assert.deepEqual(f.hit(panel, 70, 45), backgroundHit('userMessageBg'));
  assert.deepEqual(f.hit(panel, 50, 54), backgroundHit('userMessageBg'));
});

test('multiline text uses separate client rects, not a union or the block width', () => {
  const f = fixture();
  const panel = f.element(f.root, { fg: 'toolOutput', bg: 'toolSuccessBg' });
  f.text(panel, 'a long first line\nshort\n', [
    rect(35, 35, 140, 12), rect(35, 55, 40, 12), rect(35, 75, 0, 12),
  ]);
  assert.deepEqual(f.hit(panel, 160, 40), textHit('toolOutput'));
  assert.deepEqual(f.hit(panel, 60, 60), textHit('toolOutput'));
  for (const [x, y] of [[160, 60], [60, 50], [35, 80], [200, 40]]) {
    assert.deepEqual(f.hit(panel, x, y), backgroundHit('toolSuccessBg'));
  }
});

test('empty text and zero-width or zero-height range rectangles do not select foreground', () => {
  const f = fixture();
  const panel = f.element(f.root, { fg: 'warning', bg: 'toolPendingBg' });
  const empty = f.text(panel, '', [rect(30, 30, 50, 10)]);
  f.text(panel, '\n', [rect(30, 30, 0, 10), rect(30, 30, 50, 0)]);
  assert.deepEqual(f.hit(panel, 30, 30), backgroundHit('toolPendingBg'));
  assert.equal(f.calls.ranges.includes(empty), false);
});

test('nested syntax chooses the nearest foreground and unannotated code inherits its block role', () => {
  const f = fixture();
  const block = f.element(f.root, { fg: 'mdCodeBlock' });
  const code = f.element(block);
  const keyword = f.element(code, { fg: 'syntaxKeyword' });
  const inner = f.element(keyword);
  f.text(inner, 'return', [rect(40, 40, 48, 12)]);
  f.text(code, ' ', [rect(88, 40, 8, 12)]);
  const variable = f.element(code, { fg: 'syntaxVariable' });
  f.text(variable, 'label', [rect(96, 40, 40, 12)]);
  for (const target of [inner, keyword, code, block, f.root]) {
    assert.deepEqual(f.hit(target, 50, 45), textHit('syntaxKeyword'));
  }
  assert.deepEqual(f.hit(code, 90, 45), textHit('mdCodeBlock'));
  assert.deepEqual(f.hit(code, 110, 45), textHit('syntaxVariable'));
});

test('only the browser target subtree supplies candidate text', () => {
  const f = fixture();
  const sibling = f.element(f.root, { fg: 'accent' });
  f.text(sibling, 'covered text', [rect(40, 40, 80, 12)]);
  const target = f.element(f.root, { bg: 'selectedBg' });
  assert.deepEqual(f.hit(target, 50, 45), backgroundHit('selectedBg'));
  assert.deepEqual(f.calls.walks, [target]);
  assert.deepEqual(f.calls.ranges, []);
});

test('panel padding and unused content width edit background rather than inherited foreground', () => {
  const f = fixture();
  const panel = f.element(f.root, { fg: 'toolOutput', bg: 'toolErrorBg' });
  const paragraph = f.element(panel);
  f.text(paragraph, 'error', [rect(40, 40, 40, 14)]);
  assert.deepEqual(f.hit(paragraph, 50, 45), textHit('toolOutput'));
  assert.deepEqual(f.hit(paragraph, 180, 45), backgroundHit('toolErrorBg'));
  assert.deepEqual(f.hit(panel, 25, 25), backgroundHit('toolErrorBg'));
});

test('nearest annotated background wins through unannotated descendants and root gaps', () => {
  const f = fixture();
  const outer = f.element(f.root, { bg: 'customMessageBg' });
  const inner = f.element(outer, { bg: 'searchMatchBg' });
  const child = f.element(inner);
  assert.deepEqual(f.hit(child, 30, 30), backgroundHit('searchMatchBg'));
  assert.deepEqual(f.hit(outer, 30, 30), backgroundHit('customMessageBg'));
  const transparent = f.element(f.root);
  assert.deepEqual(f.hit(transparent, 30, 30), backgroundHit('terminal'));
  assert.deepEqual(f.hit(f.root, 380, 380), backgroundHit('terminal'));
});

test('foreground, border and background inheritance stops at the supplied root', () => {
  const bare = fixture({ fg: '', bg: '' });
  const outside = bare.element(null, {
    fg: 'accent', bg: 'selectedBg', border: 'border', rects: [rect(0, 0, 400, 400)],
    style: { borderLeftWidth: '1px', borderLeftStyle: 'solid' },
  });
  bare.root.parentElement = outside;
  outside.children.push(bare.root);
  const child = bare.element(bare.root);
  bare.text(child, 'plain', [rect(40, 40, 40, 12)]);
  assert.equal(bare.hit(child, 45, 45), null);
  assert.equal(bare.hit(child, 180, 80), null);
  assert.equal(bare.hit(bare.root, 0.5, 60), null);
});

for (const [side, x, y] of [
  ['Top', 70, 20.5], ['Right', 219.5, 60], ['Bottom', 70, 119.5], ['Left', 20.5, 60],
]) {
  test(`${side.toLowerCase()} painted border selects its annotated role before background`, () => {
    const f = fixture();
    const panel = f.element(f.root, {
      bg: 'userMessageBg', border: 'mdCodeBlockBorder',
      style: { [`border${side}Width`]: '1px', [`border${side}Style`]: 'solid' },
    });
    assert.deepEqual(f.hit(panel, x, y), borderHit('mdCodeBlockBorder'));
    assert.deepEqual(f.hit(panel, 70, 60), backgroundHit('userMessageBg'));
  });
}

test('session input top and bottom borders have distinct roles and side annotations override generic borders', () => {
  const f = fixture();
  const input = f.element(f.root, {
    border: 'borderMuted',
    attrs: { 'data-theme-border-top': 'borderAccent', 'data-theme-border-bottom': 'border' },
    style: {
      borderTopWidth: '1px', borderTopStyle: 'solid',
      borderBottomWidth: '2px', borderBottomStyle: 'solid',
      borderLeftWidth: '1px', borderLeftStyle: 'solid',
    },
  });
  assert.deepEqual(f.hit(input, 60, 20.5), borderHit('borderAccent'));
  assert.deepEqual(f.hit(input, 60, 118.5), borderHit('border'));
  assert.deepEqual(f.hit(input, 20.5, 60), borderHit('borderMuted'));
  assert.deepEqual(f.hit(input, 60, 60), backgroundHit('terminal'));
});

test('zero, absent, none and hidden borders do not select a border role', () => {
  for (const options of [
    { width: '0px', style: 'solid', role: 'mdHr' },
    { width: '1px', style: 'none', role: 'mdHr' },
    { width: '1px', style: 'hidden', role: 'mdHr' },
    { width: '1px', style: 'solid', role: undefined },
  ]) {
    const f = fixture();
    const node = f.element(f.root, {
      border: options.role,
      style: { borderTopWidth: options.width, borderTopStyle: options.style },
    });
    assert.deepEqual(f.hit(node, 60, 20.5), backgroundHit('terminal'));
  }
});

test('border testing uses inline fragments rather than their bounding union', () => {
  const f = fixture();
  const node = f.element(f.root, {
    border: 'thinkingHigh', rects: [rect(20, 20, 90, 15), rect(20, 45, 35, 15)],
    style: { borderRightWidth: '1px', borderRightStyle: 'solid' },
  });
  assert.deepEqual(f.hit(node, 109.5, 25), borderHit('thinkingHigh'));
  assert.deepEqual(f.hit(node, 54.5, 50), borderHit('thinkingHigh'));
  assert.deepEqual(f.hit(node, 109.5, 50), backgroundHit('terminal'));
  assert.deepEqual(f.hit(node, 109.5, 40), backgroundHit('terminal'));
});

test('text rectangles take precedence over border and fill candidates', () => {
  const f = fixture();
  const node = f.element(f.root, {
    fg: 'mdQuote', bg: 'selectedBg', border: 'mdQuoteBorder',
    style: { borderLeftWidth: '2px', borderLeftStyle: 'solid' },
  });
  f.text(node, 'quote', [rect(20, 40, 45, 12)]);
  assert.deepEqual(f.hit(node, 21, 45), textHit('mdQuote'));
  assert.deepEqual(f.hit(node, 21, 60), borderHit('mdQuoteBorder'));
});

test('child borders beat ancestor fills, but an opaque child fill covers ancestor borders', () => {
  const f = fixture();
  const outer = f.element(f.root, {
    bg: 'userMessageBg', border: 'borderAccent',
    style: { borderLeftWidth: '2px', borderLeftStyle: 'solid' },
  });
  const filled = f.element(outer, { bg: 'searchMatchBg' });
  assert.deepEqual(f.hit(filled, 21, 50), backgroundHit('searchMatchBg'));
  const transparent = f.element(outer);
  assert.deepEqual(f.hit(transparent, 21, 50), borderHit('borderAccent'));
  const bordered = f.element(outer, {
    border: 'mdQuoteBorder', rects: [rect(40, 40, 80, 40)],
    style: { borderTopWidth: '2px', borderTopStyle: 'solid' },
  });
  assert.deepEqual(f.hit(bordered, 60, 41), borderHit('mdQuoteBorder'));
});

test('horizontally scrolled pre text outside the client area cannot steal surrounding background clicks', () => {
  const f = fixture();
  const pre = f.element(f.root, {
    fg: 'mdCodeBlock', rects: [rect(40, 40, 100, 80)],
    style: { overflowX: 'auto' }, clientLeft: 2, clientWidth: 96,
  });
  const syntax = f.element(pre, { fg: 'syntaxString' });
  f.text(syntax, 'a long scrolled string', [rect(10, 50, 200, 14)]);
  assert.deepEqual(f.hit(pre, 80, 55), textHit('syntaxString'));
  // The browser targets the session where the pre's overflow is clipped.
  for (const x of [30, 41, 138, 170]) {
    assert.deepEqual(f.hit(f.root, x, 55), backgroundHit('terminal'));
  }
  assert.deepEqual(f.hit(pre, 42, 55), textHit('syntaxString'));
  assert.deepEqual(f.hit(pre, 137.9, 55), textHit('syntaxString'));
});

test('vertical clipping includes clientTop and clientHeight and applies through ancestors', () => {
  const f = fixture();
  const panel = f.element(f.root, {
    bg: 'toolSuccessBg', rects: [rect(40, 40, 120, 60)],
    style: { overflowY: 'hidden' }, clientTop: 2, clientHeight: 56,
  });
  const nested = f.element(panel, { fg: 'toolOutput' });
  f.text(nested, 'scrolled lines', [rect(50, 20, 40, 100)]);
  assert.deepEqual(f.hit(panel, 60, 42), textHit('toolOutput'));
  assert.deepEqual(f.hit(panel, 60, 97.9), textHit('toolOutput'));
  for (const y of [30, 41, 98, 110]) {
    assert.deepEqual(f.hit(f.root, 60, y), backgroundHit('terminal'));
  }
});

test('visible overflow is selectable outside ancestor boxes while root clipping still applies', () => {
  const f = fixture();
  const parent = f.element(f.root, { rects: [rect(40, 40, 40, 20)] });
  const child = f.element(parent, { fg: 'syntaxNumber' });
  f.text(child, '12345', [rect(90, 45, 40, 12)]);
  assert.deepEqual(f.hit(child, 100, 50), textHit('syntaxNumber'));
  f.root.computedStyle.overflowX = 'clip';
  f.root.clientWidth = 95;
  assert.deepEqual(f.hit(f.root, 100, 50), backgroundHit('terminal'));
});

test('hidden and display:none descendants are skipped during ancestor text walks', () => {
  for (const style of [{ visibility: 'hidden' }, { display: 'none' }]) {
    const f = fixture();
    const hidden = f.element(f.root, { fg: 'accent', style });
    const nested = f.element(hidden);
    f.text(nested, 'not painted', [rect(40, 40, 80, 14)]);
    assert.deepEqual(f.hit(f.root, 50, 45), backgroundHit('terminal'));
    assert.deepEqual(f.calls.ranges, []);
  }
});

test('explicit bullet span selects mdListBullet while list text inherits text', () => {
  const f = fixture();
  const li = f.element(f.root, { rects: [rect(50, 40, 170, 20)] });
  const bullet = f.element(li, { fg: 'mdListBullet', rects: [rect(30, 40, 8, 14)] });
  f.text(bullet, '•', [rect(30, 40, 8, 14)]);
  f.text(li, 'Keep it small', [rect(50, 40, 105, 14)]);
  assert.deepEqual(f.hit(bullet, 34, 45), textHit('mdListBullet'));
  assert.deepEqual(f.hit(li, 70, 45), textHit('text'));
  assert.deepEqual(f.hit(f.root, 43, 45), backgroundHit('terminal'));
});
