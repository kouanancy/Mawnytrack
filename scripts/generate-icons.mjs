// Génère les icônes PNG (favicon, apple-touch-icon, manifest PWA) à partir de public/mawnytrack-icon.svg.
// Usage : npm run icons
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile(new URL("../public/mawnytrack-icon.svg", import.meta.url));
const out = new URL("../public/icons/", import.meta.url);
await mkdir(out, { recursive: true });

const render = (size) => sharp(svg, { density: 72 * (size / 64) * 2 }).resize(size, size);

// Icônes standard : coins arrondis du logo conservés, fond transparent
for (const [name, size] of [["icon-32.png", 32], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  await render(size).png().toFile(new URL(name, out).pathname);
}

// apple-touch-icon et maskable : carré plein (iOS et Android appliquent leur propre masque)
const BG = "#0F3B32";
const fullBleed = async (size, inner, name) => {
  const logo = await render(inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(new URL(name, out).pathname);
};
await fullBleed(180, 180, "apple-touch-icon.png");
await fullBleed(512, 410, "icon-maskable-512.png");

// favicon.ico (navigateurs qui le demandent à la racine) : conteneur ICO autour d'un PNG 32×32
const png = await render(32).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
await writeFile(new URL("../app/favicon.ico", import.meta.url), Buffer.concat([ico, png]));

console.log("Icônes générées dans public/icons/ et app/favicon.ico");
