// SVG -> PNG for the report images (Node only; uses native resvg).
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { reportSvg } from '../public/lib/report-svg.js';
import { reportSvgsMobile } from '../public/lib/report-mobile-svg.js';

const logoDataUri = 'data:image/png;base64,' + readFileSync(new URL('../assets/logo.png', import.meta.url)).toString('base64');
const fontFiles = ['Medium', 'SemiBold', 'Bold'].map((w) => new URL(`../assets/fonts/BarlowCondensed-${w}.ttf`, import.meta.url).pathname);

export const toPng = (svg) =>
  new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Barlow Condensed' } }).render().asPng();

/** Phone-first set, in the order to post: [{ name, png }] */
export const renderMobileSet = (data) => reportSvgsMobile(data, { logoDataUri }).map(({ name, svg }) => ({ name, png: toPng(svg) }));

/** Wide desktop version */
export const renderWide = (data) => toPng(reportSvg(data, { logoDataUri }));
