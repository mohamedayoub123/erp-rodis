import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outDir = path.join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

const bg = "#0c4a6e";
const fg = "#ffffff";

function regularSvg(size) {
  const radius = size * 0.18;
  const fontSize = size * 0.52;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>
  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}" fill="${fg}">R</text>
</svg>`;
}

function maskableSvg(size) {
  // Safe zone for maskable icons is the inner ~80% circle, so keep the
  // glyph well within that area and let the background fill the canvas.
  const fontSize = size * 0.38;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}" fill="${fg}">R</text>
</svg>`;
}

const targets = [
  { name: "icon-192.png", size: 192, svg: regularSvg },
  { name: "icon-512.png", size: 512, svg: regularSvg },
  { name: "icon-maskable-512.png", size: 512, svg: maskableSvg },
  { name: "apple-touch-icon.png", size: 180, svg: regularSvg },
];

for (const target of targets) {
  const svg = Buffer.from(target.svg(target.size));
  await sharp(svg).png().toFile(path.join(outDir, target.name));
  console.log("wrote", target.name);
}
