// A deliberately limited DOM double: no layout, CSS, Safari, accessibility tree,
// native constraint validation or real browser event loop. Unknown IDs return null.
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const decode = value => String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const camel = value => value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function makeDom(html) {
  const listeners = new Map();
  const document = { activeElement: null, visibilityState: 'visible', listeners };
  class Element {
    constructor(tagName = 'div', attrs = {}) {
      this.tagName = tagName.toUpperCase(); this.attrs = { ...attrs }; this.children = []; this.parentElement = null;
      this.id = attrs.id || ''; this.type = attrs.type || (tagName === 'button' ? 'submit' : ''); this.name = attrs.name || '';
      this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [camel(k.slice(5)), v]));
      this.value = attrs.value || ''; this.defaultValue = this.value; this.checked = 'checked' in attrs; this.defaultChecked = this.checked;
      this.hidden = 'hidden' in attrs; this.open = 'open' in attrs; this.disabled = 'disabled' in attrs; this.required = 'required' in attrs;
      this.textContent = ''; this._html = ''; this.htmlWrites = 0; this.scrollTop = 0; this.scrollLeft = 0; this.listeners = new Map();
      this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
      const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
      this.classList = {
        add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: n => classes.has(n), toggle: (name, force) => { const on = force === undefined ? !classes.has(name) : force; if (on) classes.add(name); else classes.delete(name); return on; }
      };
    }
    get innerHTML() { return this._html; }
    set innerHTML(value) { this.htmlWrites += 1; this._html = String(value); this.children = []; parse(this._html, this); }
    get elements() { return this.querySelectorAll('input,select,textarea,button'); }
    get options() { return this.querySelectorAll('option'); }
    get isConnected() { return root.contains(this); }
    matches(selector) {
      const attrTests = [...selector.matchAll(/\[([\w-]+)(?:\s*=\s*["']?([^\]"']*)["']?)?\]/g)];
      const withoutAttrs = selector.replace(/\[[^\]]*\]/g, '');
      const tag = withoutAttrs.match(/^[\w-]+/);
      if (tag && this.tagName !== tag[0].toUpperCase()) return false;
      const id = withoutAttrs.match(/#([\w-]+)/); if (id && this.id !== id[1]) return false;
      for (const c of withoutAttrs.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(c[1])) return false;
      if (withoutAttrs.includes(':checked') && !this.checked) return false;
      for (const [, name, value] of attrTests) {
        const actual = name === 'open' ? (this.open ? '' : undefined) : name === 'hidden' ? (this.hidden ? '' : undefined) : this.attrs[name];
        if (actual === undefined || value !== undefined && actual !== value) return false;
      }
      return true;
    }
    querySelectorAll(selector) {
      const descendants = [];
      const visit = node => node.children.forEach(child => { descendants.push(child); visit(child); }); visit(this);
      return descendants.filter(node => selector.split(',').some(part => {
        const pieces = part.trim().split(/\s+(?![^\[]*\])/); if (!node.matches(pieces.pop())) return false;
        let parent = node.parentElement;
        while (pieces.length) { const previous = pieces.pop(); while (parent && !parent.matches(previous)) parent = parent.parentElement; if (!parent) return false; parent = parent.parentElement; }
        return true;
      }));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { let node = this; while (node) { if (node.matches(selector)) return node; node = node.parentElement; } return null; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    append(...nodes) { nodes.forEach(node => { if (node.parentElement) node.remove(); node.parentElement = this; this.children.push(node); }); }
    appendChild(node) { this.append(node); return node; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); this.parentElement = null; }
    insertAdjacentHTML(position, html) { if (position !== 'beforeend') throw new Error(`Unsupported position ${position}`); this._html += html; parse(html, this); }
    setAttribute(name, value) { this.attrs[name] = String(value); if (name === 'id') this.id = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    removeAttribute(name) { delete this.attrs[name]; }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
    dispatchEvent(event) { if (!event.target) Object.defineProperty(event, 'target', { value: this }); for (const fn of this.listeners.get(event.type) || []) fn(event); if (event.bubbles) this.parentElement?.dispatchEvent(event); return true; }
    reset() { this.elements.forEach(e => { e.value = e.defaultValue; e.checked = e.defaultChecked; }); }
    reportValidity() { return this.validityResult !== false; }
    showModal() { this.open = true; }
    close() { this.open = false; for (const fn of this.listeners.get('close') || []) fn({ target: this }); }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    click() { for (const fn of this.listeners.get('click') || []) fn({ target: this, preventDefault() {} }); }
  }
  function parse(text, parent) {
    const stack = [parent];
    for (const token of text.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?([A-Za-z][\w:-]*)\b([^>]*)>|([^<]+)/g)) {
      if (token[3]) { stack.at(-1).textContent += decode(token[3]); continue; }
      if (!token[1]) continue;
      const tag = token[1].toLowerCase();
      if (token[0].startsWith('</')) { const index = stack.findLastIndex(e => e.tagName === tag.toUpperCase()); if (index > 0) stack.length = index; continue; }
      const attrs = {};
      for (const a of token[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
      const element = new Element(tag, attrs); stack.at(-1).append(element);
      if (!voidTags.has(tag) && !token[0].endsWith('/>')) stack.push(element);
    }
    parent.querySelectorAll('select').forEach(select => { const option = select.options.find(o => 'selected' in o.attrs) || select.options[0]; if (option) select.defaultValue = select.value = option.value; });
    parent.querySelectorAll('textarea').forEach(e => { e.defaultValue = e.value = e.textContent; });
  }
  const root = new Element('document'); parse(html, root);
  document.body = root.querySelector('body'); document.documentElement = root.querySelector('html'); document.activeElement = document.body;
  document.querySelector = selector => root.querySelector(selector);
  document.querySelectorAll = selector => root.querySelectorAll(selector);
  document.createElement = tag => new Element(tag);
  document.addEventListener = (type, fn, capture = false) => { const key = `${type}:${Boolean(capture)}`; if (!listeners.has(key)) listeners.set(key, []); listeners.get(key).push(fn); };
  return { document, root, async click(idOrElement) { const target = typeof idOrElement === 'string' ? document.querySelector(`#${idOrElement}`) : idOrElement; if (!target) throw new Error(`Missing real HTML button ${idOrElement}`); const event = { target, preventDefault() {}, stopImmediatePropagation() {} }; for (const fn of listeners.get('click:false') || []) await fn(event); }, async submit(id) { const target = document.querySelector(`#${id}`); if (!target) throw new Error(`Missing form ${id}`); for (const fn of target.listeners.get('submit') || []) await fn({ target, preventDefault() {} }); } };
}
