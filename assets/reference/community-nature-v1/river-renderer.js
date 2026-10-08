// Integration example: call inside a Canvas2D world-coordinate transform.
// Caller owns water-mask clipping. Draw banks/bridge/boat AFTER the water.
// Alternating mirrored tiles meet at the same image edge, avoiding abrupt joins.
export function drawRiverWater(ctx, image, bounds, tileSize = 256) {
  if (!image.complete || !image.naturalWidth || tileSize <= 0) return;
  const x0 = Math.floor(bounds.x / tileSize);
  const y0 = Math.floor(bounds.y / tileSize);
  const x1 = Math.ceil((bounds.x + bounds.width) / tileSize);
  const y1 = Math.ceil((bounds.y + bounds.height) / tileSize);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const flipX = Math.abs(x % 2) === 1;
      const flipY = Math.abs(y % 2) === 1;
      ctx.save();
      ctx.translate((x + (flipX ? 1 : 0)) * tileSize,
                    (y + (flipY ? 1 : 0)) * tileSize);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(image, 0, 0, tileSize, tileSize);
      ctx.restore();
    }
  }
  ctx.restore();
}
