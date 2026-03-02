/**
 * Generates colored status icons for the system tray.
 * Run: node scripts/generate-status-icons.js
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SIZE = 32;
const COLORS = {
  green: [34, 197, 94],   // #22c55e - connected
  red: [239, 68, 68],    // #ef4444 - error
  blue: [59, 130, 246],  // #3b82f6 - unconfigured
  yellow: [234, 179, 8], // #eab308 - authenticating
};

function drawCircle(png, cx, cy, r, r2, g2, b2, a) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const distSq = dx * dx + dy * dy;
      const idx = (png.width * y + x) << 2;
      if (distSq <= r * r) {
        png.data[idx] = r2;
        png.data[idx + 1] = g2;
        png.data[idx + 2] = b2;
        png.data[idx + 3] = a;
      } else if (distSq <= (r + 2) * (r + 2)) {
        const alpha = 1 - (Math.sqrt(distSq) - r) / 2;
        png.data[idx] = r2;
        png.data[idx + 1] = g2;
        png.data[idx + 2] = b2;
        png.data[idx + 3] = Math.round(alpha * 255);
      }
    }
  }
}

function createIcon(colorName) {
  const [r, g, b] = COLORS[colorName];
  const png = new PNG({ width: SIZE, height: SIZE });

  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
  }

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = 12;
  drawCircle(png, cx, cy, radius, r, g, b, 255);

  const outPath = path.join(__dirname, '..', `icon-${colorName}.png`);
  return new Promise((resolve, reject) => {
    png
      .pack()
      .pipe(fs.createWriteStream(outPath))
      .on('finish', () => {
        console.log(`Wrote ${outPath}`);
        resolve();
      })
      .on('error', reject);
  });
}

(async () => {
  for (const colorName of Object.keys(COLORS)) {
    await createIcon(colorName);
  }
})();
