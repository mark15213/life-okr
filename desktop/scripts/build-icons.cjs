// Resize generated artwork without changing its alpha channel or design.
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

(async () => {
  const assets = path.resolve(__dirname, '../assets');
  const source = path.join(assets, 'logo-source.png');
  await sharp(source).resize(1024, 1024).png().toFile(path.join(assets, 'icon.png'));
  for (const scale of [1, 2, 3]) {
    await sharp(path.join(assets, 'tray-source.png')).resize(18 * scale, 18 * scale)
      .png().toFile(path.join(assets, `trayTemplate${scale === 1 ? '' : `@${scale}x`}.png`));
  }
  if (process.platform === 'darwin') {
    const iconset = path.join(assets, 'Hustle.iconset');
    fs.mkdirSync(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        await sharp(source).resize(size * scale, size * scale).png()
          .toFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
      }
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(assets, 'icon.icns')]);
    fs.rmSync(iconset, { recursive: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
