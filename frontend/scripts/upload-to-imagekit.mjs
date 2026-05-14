/**
 * Uploads all static images from frontend/public/ to ImageKit.
 * Run once during setup: node scripts/upload-to-imagekit.mjs
 *
 * Reads credentials from env vars or falls back to the constants below.
 * Does NOT delete local files.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const PRIVATE_KEY      = process.env.IMAGEKIT_PRIVATE_KEY  || 'private_hPsyf40k1GtAFmPqn3DUdaBdAAk=';
const URL_ENDPOINT     = process.env.NEXT_PUBLIC_IMAGEKIT_URL || 'https://ik.imagekit.io/2pg1fp1lr';
const UPLOAD_URL       = 'https://upload.imagekit.io/api/v1/files/upload';
const AUTH_HEADER      = 'Basic ' + Buffer.from(`${PRIVATE_KEY}:`).toString('base64');
const PUBLIC_DIR       = join(__dirname, '..', 'public');

// Skip Next.js placeholder SVGs and the vanilla JS files
const SKIP_FILES = new Set(['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg']);
const SKIP_DIRS  = new Set(['js']);           // contains scatter-gallery.js etc., not images
const IMAGE_EXT  = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) results.push(...walk(fullPath));
    } else {
      const ext = entry.slice(entry.lastIndexOf('.')).toLowerCase();
      if (IMAGE_EXT.has(ext) && !SKIP_FILES.has(entry)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

async function uploadFile(filePath) {
  const relPath  = relative(PUBLIC_DIR, filePath).replace(/\\/g, '/');
  const parts    = relPath.split('/');
  const fileName = parts.pop();
  const folder   = parts.length ? '/' + parts.join('/') : '/';

  const buf  = readFileSync(filePath);
  const blob = new Blob([buf]);

  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('fileName', fileName);
  form.append('folder', folder);
  form.append('useUniqueFileName', 'false');
  form.append('overwriteFile', 'true');

  const res  = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: AUTH_HEADER },
    body: form,
  });
  const json = await res.json();

  if (!res.ok) throw new Error(JSON.stringify(json));
  return { relPath: `/${relPath}`, url: json.url };
}

async function main() {
  const files = walk(PUBLIC_DIR);
  console.log(`\nUploading ${files.length} images to ImageKit (${URL_ENDPOINT})\n`);

  const urlMap = {};
  let ok = 0, fail = 0;

  for (const filePath of files) {
    const rel = '/' + relative(PUBLIC_DIR, filePath).replace(/\\/g, '/');
    process.stdout.write(`  ${rel.padEnd(60)}`);
    try {
      const { url } = await uploadFile(filePath);
      urlMap[rel]   = url;
      console.log('✓');
      ok++;
    } catch (err) {
      console.log(`✗  ${err.message.slice(0, 80)}`);
      fail++;
    }
  }

  console.log(`\n${ok} uploaded, ${fail} failed.\n`);
  console.log('=== URL MAP (save this for reference) ===');
  console.log(JSON.stringify(urlMap, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
