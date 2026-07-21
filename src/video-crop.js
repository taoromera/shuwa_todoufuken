/** Pixels to remove from the bottom edge (at 640px-tall source videos). */
export const LABEL_HIDE_BOTTOM_PX = 150;
export const LABEL_HIDE_REFERENCE_HEIGHT = 640;

export function scaledBottomCropPixels(videoHeight) {
  return Math.round(LABEL_HIDE_BOTTOM_PX * (videoHeight / LABEL_HIDE_REFERENCE_HEIGHT));
}

/** Full-canvas NHK recordings; lesson uploads are already trimmed. */
export function needsLabelCrop(videoWidth, videoHeight) {
  return videoWidth > 560 || videoHeight > 530;
}

export function evenDimension(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function cropFilterForSize(videoWidth, videoHeight) {
  const bottom = evenDimension(scaledBottomCropPixels(videoHeight));
  const cropHeight = evenDimension(videoHeight - bottom);
  return `crop=${evenDimension(videoWidth)}:${cropHeight}:0:0`;
}
