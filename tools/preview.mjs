// Local preview:
//   node tools/preview.mjs sample/2025-08-22.json out.png            (wide desktop image)
//   node tools/preview.mjs sample/2025-08-22.json outprefix --mobile (phone set: outprefix-summary.png, ...)
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { reportSvg } from '../functions/_lib/report-svg.js';
import { reportSvgsMobile } from '../functions/_lib/report-mobile-svg.js';

const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const [input = 'sample/2025-08-22.json', output = mobile ? 'preview' : 'preview.png'] = args.filter((a) => a !== '--mobile');
const data = JSON.parse(readFileSync(input, 'utf8'));
const logoDataUri = 'data:image/png;base64,' + readFileSync(new URL('../assets/logo.png', import.meta.url)).toString('base64');
const fontFiles = ['Medium', 'SemiBold', 'Bold'].map((w) => new URL(`../assets/fonts/BarlowCondensed-${w}.ttf`, import.meta.url).pathname);
const png = (svg) => new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Barlow Condensed' } }).render().asPng();

if (mobile) {
  for (const { name, svg } of reportSvgsMobile(data, { logoDataUri })) {
    const out = `${output}-${name}.png`;
    const buf = png(svg);
    writeFileSync(out, buf);
    console.log(`${out}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
} else {
  const buf = png(reportSvg(data, { logoDataUri }));
  writeFileSync(output, buf);
  console.log(`${output}  ${(buf.length / 1024).toFixed(0)} KB`);
}
