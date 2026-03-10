/**
 * API middleware — works in both Vite dev server and standalone Node http server.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DATA_FILE = join(DATA_DIR, 'presentations.json');

mkdirSync(DATA_DIR, { recursive: true });

function read() {
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function write(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function reply(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

export async function apiMiddleware(req, res, next) {
  const { method } = req;
  const p = new URL(req.url, 'http://localhost').pathname;

  if (!p.startsWith('/api/')) return next?.();

  if (method === 'GET' && p === '/api/presentations') {
    return reply(res, 200, read());
  }
  if (method === 'GET' && p.startsWith('/api/presentations/')) {
    const id = p.slice('/api/presentations/'.length);
    const found = read().find(x => x.id === id);
    return found ? reply(res, 200, found) : reply(res, 404, { error: 'Not found' });
  }
  if (method === 'POST' && p === '/api/presentations') {
    const body = await parseBody(req);
    const all = read();
    all.unshift(body);
    write(all);
    return reply(res, 201, body);
  }
  if (method === 'PUT' && p.startsWith('/api/presentations/')) {
    const id = p.slice('/api/presentations/'.length);
    const body = await parseBody(req);
    const all = read();
    const idx = all.findIndex(x => x.id === id);
    if (idx < 0) return reply(res, 404, { error: 'Not found' });
    all[idx] = { ...body, updatedAt: Date.now() };
    write(all);
    return reply(res, 200, all[idx]);
  }
  if (method === 'DELETE' && p.startsWith('/api/presentations/')) {
    const id = p.slice('/api/presentations/'.length);
    write(read().filter(x => x.id !== id));
    res.writeHead(204);
    return res.end();
  }
  if (method === 'POST' && p === '/api/sync') {
    const body = await parseBody(req);
    if (Array.isArray(body.presentations)) write(body.presentations);
    res.writeHead(204);
    return res.end();
  }

  reply(res, 404, { error: `No API route: ${method} ${p}` });
}
