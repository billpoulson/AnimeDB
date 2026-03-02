const fs = require('fs');
const { PNG } = require('pngjs');

const size = 256;
const png = new PNG({ width: size, height: size });

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = (size * y + x) << 2;
    png.data[i] = 59;     // R
    png.data[i + 1] = 130; // G
    png.data[i + 2] = 246; // B
    png.data[i + 3] = 255; // A
  }
}

png.pack().pipe(fs.createWriteStream('icon.png')).on('finish', () => {
  console.log('Created icon.png');
});
