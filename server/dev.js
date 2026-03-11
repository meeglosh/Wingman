#!/usr/bin/env node
/**
 * Dev server — Vite in middleware mode + API, single port.
 * Usage: node server/dev.js
 */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { apiMiddleware } from './api.js';

const PORT = process.env.PORT ?? 5173;

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'spa',
});

const server = createHttpServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) {
    return apiMiddleware(req, res, () => { res.writeHead(404); res.end(); });
  }
  vite.middlewares.handle(req, res, () => {});
});

server.listen(PORT, () => {
  console.log(`Wingman dev  →  http://localhost:${PORT}`);
});
