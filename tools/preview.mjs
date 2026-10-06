// Local preview: node tools/preview.mjs sample/2025-08-22.json out.png
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { reportSvg } from '../functions/_lib/report-svg.js';

const [input = 'sample/2025-08-22.json', output = 'preview.png'] = process.argv.slice(2);
const data = JSON.parse(readFileSync(input, 'utf8'));
const logo = 'data:image/png;base64,' + readFileSync(new URL('../assets/logo.png', import.meta.url)).toString('base64');
const svg = reportSvg(data, { logoDataUri: logo });
const fonts = ['Medium', 'SemiBold', 'Bold'].map((w) => new URL(`../assets/fonts/BarlowCondensed-${w}.ttf`, import.meta.url).pathname);
const png = new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'Barlow Condensed' } }).render().asPng();
writeFileSync(output, png);
console.log(`${output}  ${(png.length / 1024).toFixed(0)} KB`);
