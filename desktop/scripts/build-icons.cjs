// Package the approved artwork for desktop, web, and iOS.
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

(async () => {
  const assets = path.resolve(__dirname, '../assets');
  const source = path.join(assets, 'logo-source.png');
  await sharp(source).resize(1024, 1024).png().toFile(path.join(assets, 'icon.png'));
  const root = path.resolve(__dirname, '../..');
  await sharp(source).resize(512, 512).png().toFile(path.join(root, 'app/icon.png'));
  // Apple touch/iOS icons must be opaque; the OS supplies the rounded mask.
  const appleIcon = await sharp(source).resize(1024, 1024)
    .flatten({ background: '#fff8e7' }).png().toBuffer();
  fs.writeFileSync(path.join(root, 'ios/Hustle/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png'), appleIcon);
  await sharp(appleIcon).resize(180, 180).png().toFile(path.join(root, 'app/apple-icon.png'));
  // ICO supports PNG entries, retaining full color and alpha at each size.
  const sizes = [16, 32, 48];
  const entries = await Promise.all(sizes.map(size => sharp(source).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach((entry, index) => {
    const position = 6 + index * 16;
    header[position] = sizes[index];
    header[position + 1] = sizes[index];
    header.writeUInt16LE(1, position + 4);
    header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(entry.length, position + 8);
    header.writeUInt32LE(offset, position + 12);
    offset += entry.length;
  });
  fs.writeFileSync(path.join(root, 'app/favicon.ico'), Buffer.concat([header, ...entries]));
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
