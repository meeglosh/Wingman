#!/usr/bin/env node
/**
 * Production server — serves built frontend + API from a single port.
 * In dev, the Vite plugin (vite.config.ts) serves the API instead.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiMiddleware } from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const PORT = process.env.PORT ?? 3000;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) {
    return apiMiddleware(req, res, () => { res.writeHead(404); res.end(); });
  }

  const urlPath = new URL(req.url, 'http://localhost').pathname;
  let filePath = join(DIST, urlPath);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, 'index.html');
  }

  res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Wingman  →  http://localhost:${PORT}`);
});
