// Production server: serves the built app from dist/ and the /api endpoints.
// Run `npm run build` first, then `npm start`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.ts';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;

    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let file = normalize(join(DIST, pathname));
    if (!file.startsWith(DIST)) file = join(DIST, 'index.html');
    const info = await stat(file).catch(() => null);
    // Unknown paths (e.g. /share from the Android share sheet) get the app shell.
    if (!info || info.isDirectory()) file = join(DIST, 'index.html');

    const body = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
    if (file.includes(`${join(DIST, 'assets')}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.end(body);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('Internal error');
  }
}).listen(PORT, () => {
  console.log(`HomeHunt running on http://localhost:${PORT}`);
});
