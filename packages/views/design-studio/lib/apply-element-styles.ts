import type { ElementPropertyDraft } from "./preview-element";

export function applyPropertyDraft(el: HTMLElement, draft: ElementPropertyDraft): void {
  el.style.fontFamily = draft.fontFamily;
  el.style.fontSize = `${draft.fontSize}px`;
  el.style.fontWeight = draft.fontWeight;
  el.style.color = draft.color;
  el.style.textAlign = draft.textAlign;
  el.style.lineHeight = `${draft.lineHeight}px`;
  el.style.letterSpacing = `${draft.letterSpacing}px`;
}

export function clearInlineStyles(el: HTMLElement): void {
  el.style.fontFamily = "";
  el.style.fontSize = "";
  el.style.fontWeight = "";
  el.style.color = "";
  el.style.textAlign = "";
  el.style.lineHeight = "";
  el.style.letterSpacing = "";
}
