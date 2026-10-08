// Coordinates in game world units; caller applies camera transform.
// Draw ripples clipped to the basin water, then foreground stone rim.
export function drawFountainSpray(ctx, img, nozzleX, nozzleY, basinWidth, seconds) {
  if (!img.complete || !img.naturalWidth) return;
  const w = basinWidth * 0.46;
  const h = w * img.naturalHeight / img.naturalWidth;
  const sy = 1 + 0.025 * Math.sin(seconds * 4);
  ctx.save();
  ctx.globalAlpha *= 0.82;
  ctx.translate(nozzleX, nozzleY);
  ctx.scale(1, sy);
  ctx.drawImage(img, -w/2, -h, w, h);
  ctx.restore();
}
export function drawFountainRipples(ctx, cx, cy, rx, ry, seconds) {
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.clip();
  ctx.strokeStyle='#d4fbff'; ctx.lineWidth=Math.max(0.5,rx*0.018);
  const baseAlpha=ctx.globalAlpha;
  for(let i=0;i<3;i++) {
    const p=((seconds*0.55+i/3)%1+1)%1;
    ctx.globalAlpha=baseAlpha*0.24*(1-p);
    ctx.beginPath();ctx.ellipse(cx,cy,rx*(0.18+0.8*p),ry*(0.18+0.8*p),0,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
