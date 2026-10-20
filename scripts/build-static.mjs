import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '');
const source = join(root, 'public');
const output = join(root, 'dist');
const files = [
  'index.html', 'fonts.css', 'styles.css', 'enquiry.css', 'slides.css', 'static.js',
  'routes.json', 'gallery.json', 'latema-logo.svg', 'latema-icon.svg',
  'manifest.webmanifest', 'robots.txt', 'sw.js'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  try { await cp(join(source, file), join(output, file)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await cp(join(source, 'media'), join(output, 'media'), { recursive: true });
await cp(join(source, 'fonts'), join(output, 'fonts'), { recursive: true });
console.log(`Prepared static Latema concept in ${output}`);
