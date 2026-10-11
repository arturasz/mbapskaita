// Privacy mode: masks amounts in every text node of the page. Dates, years and
// percentages stay readable. Original text is kept so turning it off restores it.

const KEEP = /\d{4}-\d{2}-\d{2}|(?<![\d.,])(?:19|20)\d{2}(?![.,]?\d)|\d+(?:[.,]\d+)?\s?%/g;
const NUMBER = /\d(?:[\d\s.,]*\d)?/g;
const SLOT = 0xe000; // private-use characters stand in for protected text while masking

export function maskNumbers(text: string): string {
  const kept: string[] = [];
  const hidden = text.replace(KEEP, (m) => String.fromCharCode(SLOT + kept.push(m) - 1));
  return hidden
    .replace(NUMBER, "•••")
    .replace(/[\ue000-\uf8ff]/g, (c) => kept[c.charCodeAt(0) - SLOT]);
}

const original = new WeakMap<Text, string>();
const written = new WeakMap<Text, string>();
const tracked = new Set<WeakRef<Text>>();

function maskNode(node: Text) {
  const cur = node.nodeValue ?? "";
  if (written.get(node) === cur) return; // our own write
  const masked = maskNumbers(cur);
  if (masked === cur) return;
  if (!original.has(node)) tracked.add(new WeakRef(node));
  original.set(node, cur);
  written.set(node, masked);
  node.nodeValue = masked;
}

function maskTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return maskNode(root as Text);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentElement.tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) maskNode(n as Text);
}

let observer: MutationObserver | null = null;

export function setPrivacy(on: boolean) {
  document.documentElement.toggleAttribute("data-private", on);
  if (on && !observer) {
    maskTree(document.body);
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") maskTree(r.target);
        r.addedNodes.forEach(maskTree);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  } else if (!on && observer) {
    observer.disconnect();
    observer = null;
    for (const ref of tracked) {
      const node = ref.deref();
      const text = node && original.get(node);
      if (node && text !== undefined && node.nodeValue === written.get(node)) node.nodeValue = text;
    }
    tracked.clear();
  }
}
