/** Integration example, not a replacement for the game's renderer.
 * Images: 128x128 pixels = four by four 32px logical cells.
 * worldTileX/Y must be integer WORLD coordinates, never camera coordinates.
 * screenX/Y and displaySize must use the same unit as the existing renderer.
 */
export function drawGroundCell(ctx, image, worldTileX, worldTileY, screenX, screenY, displaySize = 32) {
  const mod4 = value => ((value % 4) + 4) % 4;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, mod4(worldTileX) * 32, mod4(worldTileY) * 32,
    32, 32, screenX, screenY, displaySize, displaySize);
  ctx.restore();
}
