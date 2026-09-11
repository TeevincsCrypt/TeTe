/**
 * Result proof: an optional screenshot attached to a report.
 *
 * Same shape as `preparePhoto` in lib/profile/local-profile.ts — downscale,
 * re-encode, step the quality down until it fits — except a scoreboard
 * screenshot is not square, so this keeps its aspect ratio instead of
 * cropping to a circle-friendly square.
 */
export const MAX_EVIDENCE_BYTES = 300_000;

export async function prepareEvidence(file: File, maxDimension = 1000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_EVIDENCE_BYTES) return url;
  }
  throw new Error('That screenshot is too large, even compressed.');
}
