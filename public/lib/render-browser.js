// Renders the phone-friendly report images in the browser (free, no server): the same SVG layout and the
// same resvg engine as the nightly email, just compiled to WebAssembly.
import { initWasm, Resvg } from '/vendor/resvg.mjs';
import { reportSvgsMobile } from './report-mobile-svg.js';

let ready;
function setup() {
  ready ||= (async () => {
    const [, fonts, logo] = await Promise.all([
      initWasm(fetch('/vendor/resvg.wasm')),
      Promise.all(['Medium', 'SemiBold', 'Bold'].map(async (w) => new Uint8Array(await (await fetch(`/fonts/BarlowCondensed-${w}.ttf`)).arrayBuffer()))),
      fetch('/logo.png').then((r) => r.blob()).then((b) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); })),
    ]);
    return { fonts, logo };
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

/** @returns [{ name, png: Uint8Array }] in posting order: summary, branches-1, branches-2 */
export async function renderImages(data) {
  const { fonts, logo } = await setup();
  return reportSvgsMobile(data, { logoDataUri: logo }).map(({ name, svg }) => {
    const r = new Resvg(svg, { font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Barlow Condensed' } });
    const png = r.render().asPng();
    r.free?.();
    return { name, png };
  });
}
