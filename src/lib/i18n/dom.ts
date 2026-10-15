import type { Translator } from "@/lib/i18n/translate";

const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "SVG", "PATH"]);

/** The text as the page wrote it (English), and the text this translator last put in its place. */
const original = new WeakMap<Text, string>();
const written = new WeakMap<Text, string>();
const attrOriginal = new WeakMap<Element, Map<string, string>>();
const attrWritten = new WeakMap<Element, Map<string, string>>();

/** Never translated: anything marked translate="no" (or class "notranslate"), e.g. a name that must stay as typed. */
function skipped(el: Element | null, attributesOnly = false): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    // a textarea or code block keeps its own content as typed, but its placeholder / title are interface text
    if (!attributesOnly && SKIP_TAGS.has(n.tagName.toUpperCase())) return true;
    if (n.getAttribute("translate") === "no" || n.classList.contains("notranslate")) return true;
  }
  return false;
}

/** The text node before this one (comments between React's text nodes are skipped). */
function previousText(node: Text): Text | null {
  let p: Node | null = node.previousSibling;
  while (p && p.nodeType === Node.COMMENT_NODE) p = p.previousSibling;
  return p && p.nodeType === Node.TEXT_NODE ? (p as Text) : null;
}

function applyText(node: Text, translator: Translator, restoreOnly: boolean) {
  const current = node.nodeValue ?? "";
  // if the page (React) changed the text since we wrote ours, the new text is the new original
  const source = original.has(node) && current === written.get(node) ? (original.get(node) as string) : current;
  original.set(node, source);
  let next = restoreOnly ? source : translator.translate(source);
  // The pages add an English plural as a separate piece of text ("5 customer" + "s"). The other languages do not use it, so when
  // the word before it has been translated the lone "s" / "es" is dropped.
  if (!restoreOnly && /^(s|es)$/.test(source)) {
    const prev = previousText(node);
    if (prev && original.has(prev) && written.get(prev) !== original.get(prev)) next = "";
  }
  if (next !== current) node.nodeValue = next;
  written.set(node, next);
}

function applyAttributes(el: Element, translator: Translator, restoreOnly: boolean) {
  for (const name of ATTRIBUTES) {
    const current = el.getAttribute(name);
    if (current === null) continue;
    const originals = attrOriginal.get(el) ?? new Map<string, string>();
    const writtens = attrWritten.get(el) ?? new Map<string, string>();
    const source = originals.has(name) && current === writtens.get(name) ? (originals.get(name) as string) : current;
    originals.set(name, source);
    const next = restoreOnly ? source : translator.translate(source);
    if (next !== current) el.setAttribute(name, next);
    writtens.set(name, next);
    attrOriginal.set(el, originals);
    attrWritten.set(el, writtens);
  }
}

function applyTree(root: Node, translator: Translator, restoreOnly: boolean) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skipped(root.parentElement)) applyText(root as Text, translator, restoreOnly);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skipped(el, true)) return;
  applyAttributes(el, translator, restoreOnly);
  el.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach((child) => {
    if (!skipped(child, true)) applyAttributes(child, translator, restoreOnly);
  });
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!skipped(n.parentElement)) applyText(n as Text, translator, restoreOnly);
  }
}

/**
 * Translates what is on the page now and keeps translating whatever the page shows later (new screens, errors, lists), by
 * replacing the text of text nodes and of placeholder / title / aria-label / alt attributes in place. The page's own code
 * is untouched; with the English translator (restoreOnly) it puts the original English back. Returns a function that stops it.
 */
export function startDomTranslation(translator: Translator, restoreOnly: boolean): () => void {
  applyTree(document.body, translator, restoreOnly);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") {
        const node = m.target as Text;
        if (node.nodeValue !== written.get(node) && !skipped(node.parentElement)) applyText(node, translator, restoreOnly);
      } else if (m.type === "attributes") {
        const el = m.target as Element;
        if (!skipped(el, true)) applyAttributes(el, translator, restoreOnly);
      } else {
        m.addedNodes.forEach((added) => applyTree(added, translator, restoreOnly));
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES] });
  return () => observer.disconnect();
}
