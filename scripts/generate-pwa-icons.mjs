// One-off generator for PWA manifest icons. Run manually with `node scripts/generate-pwa-icons.mjs`
// whenever the icon design needs to change; output PNGs are committed to public/icons/ and this
// script is not part of the build (sharp is only an optional transitive dependency here, pulled
// in by Next.js's own image optimization, same convention as scripts/extract-design-fonts.mjs).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const BRAND_BLUE = '#0066FF'; // --atomic-blue-50 / --color-primary-normal (app/globals.css)
const OUT_DIR = path.join(process.cwd(), 'public', 'icons');

function iconSvg({ size, crossSize, rounded }) {
  const rx = rounded ? Math.round(size * 0.1875) : 0;
  const center = size / 2;
  const armLength = crossSize;
  const armThickness = crossSize * 0.36;
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${BRAND_BLUE}"/>
  <g fill="#FFFFFF">
    <rect x="${center - armThickness / 2}" y="${center - armLength / 2}" width="${armThickness}" height="${armLength}" rx="${armThickness * 0.2}"/>
    <rect x="${center - armLength / 2}" y="${center - armThickness / 2}" width="${armLength}" height="${armThickness}" rx="${armThickness * 0.2}"/>
  </g>
</svg>`;
}

async function renderPng(svg, size, filename) {
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(path.join(OUT_DIR, filename), buffer);
  console.log(`wrote ${filename}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // Regular icon: rounded rect, cross sized to look right in a normal (non-cropped) icon slot.
  const regular512 = iconSvg({ size: 512, crossSize: 260, rounded: true });
  // Maskable icon: full-bleed square background + smaller cross, so it stays inside the
  // ~80% "safe zone" that maskable-icon-consuming launchers crop to (per the maskable icon spec).
  const maskable512 = iconSvg({ size: 512, crossSize: 190, rounded: false });

  await renderPng(regular512, 512, 'icon-512.png');
  await renderPng(regular512, 192, 'icon-192.png');
  await renderPng(maskable512, 512, 'icon-512-maskable.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
