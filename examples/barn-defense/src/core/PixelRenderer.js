// =============================================================================
// Barn Defense - PixelRenderer
// Renders 2D pixel matrices to Phaser textures.
// Canvas dimensions are rounded to integers for proper rendering.
// =============================================================================

/**
 * Renders a 2D pixel matrix to a Phaser texture.
 */
export function renderPixelArt(scene, pixels, palette, key, scale = 2) {
  if (scene.textures.exists(key)) return;

  const h = pixels.length;
  const w = pixels[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');

  // Compute per-pixel size to fill canvas exactly
  const pxW = canvas.width / w;
  const pxH = canvas.height / h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = pixels[y][x];
      if (idx === 0 || palette[idx] == null) continue;
      const color = palette[idx];
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      // Use floor/ceil to avoid sub-pixel gaps
      const rx = Math.floor(x * pxW);
      const ry = Math.floor(y * pxH);
      const rw = Math.ceil((x + 1) * pxW) - rx;
      const rh = Math.ceil((y + 1) * pxH) - ry;
      ctx.fillRect(rx, ry, rw, rh);
    }
  }

  scene.textures.addCanvas(key, canvas);
}

/**
 * Renders multiple frames as a spritesheet texture.
 */
export function renderSpriteSheet(scene, frames, palette, key, scale = 2) {
  if (scene.textures.exists(key)) return;

  const h = frames[0].length;
  const w = frames[0][0].length;
  const frameW = Math.round(w * scale);
  const frameH = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = frameW * frames.length;
  canvas.height = frameH;
  const ctx = canvas.getContext('2d');

  // Compute per-pixel size to fill frame exactly
  const pxW = frameW / w;
  const pxH = frameH / h;

  frames.forEach((pixels, fi) => {
    const offsetX = fi * frameW;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = pixels[y][x];
        if (idx === 0 || palette[idx] == null) continue;
        const color = palette[idx];
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const rx = Math.floor(x * pxW);
        const ry = Math.floor(y * pxH);
        const rw = Math.ceil((x + 1) * pxW) - rx;
        const rh = Math.ceil((y + 1) * pxH) - ry;
        ctx.fillRect(offsetX + rx, ry, rw, rh);
      }
    }
  });

  // Add as canvas texture, then manually define spritesheet frames
  const tex = scene.textures.addCanvas(key, canvas);
  for (let i = 0; i < frames.length; i++) {
    tex.add(i, 0, i * frameW, 0, frameW, frameH);
  }
}
