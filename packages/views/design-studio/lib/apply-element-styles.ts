import type { ElementPropertyDraft } from "./preview-element";

export function applyPropertyDraft(el: HTMLElement, draft: ElementPropertyDraft): void {
  el.style.width = `${draft.width}px`;
  el.style.height = `${draft.height}px`;
  el.style.background = draft.fill;
  el.style.opacity = String(draft.opacity);
  el.style.paddingTop = `${draft.padding.top}px`;
  el.style.paddingRight = `${draft.padding.right}px`;
  el.style.paddingBottom = `${draft.padding.bottom}px`;
  el.style.paddingLeft = `${draft.padding.left}px`;
  el.style.marginTop = `${draft.margin.top}px`;
  el.style.marginRight = `${draft.margin.right}px`;
  el.style.marginBottom = `${draft.margin.bottom}px`;
  el.style.marginLeft = `${draft.margin.left}px`;
  el.style.borderRadius = `${draft.borderRadius}px`;
  el.style.fontWeight = draft.fontWeight;
  el.style.textAlign = draft.textAlign;
}

export function clearInlineStyles(el: HTMLElement): void {
  el.style.width = "";
  el.style.height = "";
  el.style.background = "";
  el.style.opacity = "";
  el.style.paddingTop = "";
  el.style.paddingRight = "";
  el.style.paddingBottom = "";
  el.style.paddingLeft = "";
  el.style.marginTop = "";
  el.style.marginRight = "";
  el.style.marginBottom = "";
  el.style.marginLeft = "";
}
