export type PreviewTool = "select" | "comment" | "crop" | "pencil" | "pen" | "camera";

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
  fontWeight: string;
  textAlign: string;
}

export interface PreviewCommentItem {
  id: string;
  element: SelectedPreviewElement;
  note: string;
}

export interface ElementPropertyDraft {
  width: number;
  height: number;
  fill: string;
  opacity: number;
  padding: ElementBoxSides;
  margin: ElementBoxSides;
  borderRadius: number;
  fontWeight: string;
  textAlign: string;
}

export function propertyDraftFromElement(
  element: SelectedPreviewElement,
): ElementPropertyDraft {
  return {
    width: element.width,
    height: element.height,
    fill: element.fill,
    opacity: element.opacity,
    padding: { ...element.padding },
    margin: { ...element.margin },
    borderRadius: element.borderRadius,
    fontWeight: element.fontWeight,
    textAlign: element.textAlign,
  };
}

export function formatPropertyPatch(
  element: SelectedPreviewElement,
  draft: ElementPropertyDraft,
): string {
  const lines = [
    `[Property edit · ${element.id}]`,
    `width: ${draft.width}px`,
    `height: ${draft.height}px`,
    `background: ${draft.fill}`,
    `opacity: ${draft.opacity}`,
    `padding: ${draft.padding.top}px ${draft.padding.right}px ${draft.padding.bottom}px ${draft.padding.left}px`,
    `margin: ${draft.margin.top}px ${draft.margin.right}px ${draft.margin.bottom}px ${draft.margin.left}px`,
    `border-radius: ${draft.borderRadius}px`,
    `font-weight: ${draft.fontWeight}`,
    `text-align: ${draft.textAlign}`,
  ];
  return lines.join("\n");
}
