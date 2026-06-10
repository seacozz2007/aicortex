export type PreviewToolMode = "comment" | "mark" | "edit";

export type MarkSubTool = "box" | "pen";

export type MarkAnnotationAction = "draft" | "queue" | "send";

export interface ElementBoxSides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ElementStyleSnapshot {
  size: string;
  color: string;
  background: string;
  font: string;
  lineHeight: string;
}

export interface SelectedPreviewElement {
  id: string;
  tag: string;
  label: string;
  rect: ElementRect;
  style: ElementStyleSnapshot;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  padding: ElementBoxSides;
  margin: ElementBoxSides;
  borderRadius: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  textAlign: string;
  lineHeight: number;
  letterSpacing: number;
}

export interface PreviewCommentItem {
  id: string;
  element: SelectedPreviewElement;
  note: string;
}

export interface ElementPropertyDraft {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  textAlign: string;
  lineHeight: number;
  letterSpacing: number;
}

export function propertyDraftFromElement(
  element: SelectedPreviewElement,
): ElementPropertyDraft {
  return {
    fontFamily: element.fontFamily,
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    color: element.color,
    textAlign: element.textAlign,
    lineHeight: element.lineHeight,
    letterSpacing: element.letterSpacing,
  };
}

export function formatPropertyPatch(
  element: SelectedPreviewElement,
  draft: ElementPropertyDraft,
): string {
  const lines = [
    `[Property edit · ${element.id}]`,
    `font-family: ${draft.fontFamily}`,
    `font-size: ${draft.fontSize}px`,
    `font-weight: ${draft.fontWeight}`,
    `color: ${draft.color}`,
    `text-align: ${draft.textAlign}`,
    `line-height: ${draft.lineHeight}px`,
    `letter-spacing: ${draft.letterSpacing}px`,
  ];
  return lines.join("\n");
}

export interface MarkAnnotationPayload {
  action: MarkAnnotationAction;
  note: string;
  imageFile?: File;
  extraFiles?: File[];
}
