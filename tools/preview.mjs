// Local preview:
//   node tools/preview.mjs sample/2026-10-05.json out.png            (wide desktop image)
//   node tools/preview.mjs sample/2026-10-05.json outprefix --mobile (phone set: outprefix-summary.png, ...)
import { readFileSync, writeFileSync } from 'node:fs';
import { renderMobileSet, renderWide } from './render.mjs';

const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const [input = 'sample/2026-10-05.json', output = mobile ? 'preview' : 'preview.png'] = args.filter((a) => a !== '--mobile');
const data = JSON.parse(readFileSync(input, 'utf8'));

if (mobile) {
  for (const { name, png } of renderMobileSet(data)) {
    writeFileSync(`${output}-${name}.png`, png);
    console.log(`${output}-${name}.png  ${(png.length / 1024).toFixed(0)} KB`);
  }
} else {
  const png = renderWide(data);
  writeFileSync(output, png);
  console.log(`${output}  ${(png.length / 1024).toFixed(0)} KB`);
}
