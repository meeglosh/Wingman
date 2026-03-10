#!/usr/bin/env node
/**
 * Wingman CLI — agent/human interface for building presentations
 *
 * Usage:
 *   wingman list
 *   wingman create "My Talk Title" [--theme obsidian|arctic|midnight|ember|forest]
 *   wingman show <id>
 *   wingman add <id> '<slide-json>'
 *   wingman add <id> @path/to/slide.json
 *   wingman delete <id>
 *   wingman open <id>
 *   wingman start
 *
 * Slide JSON shape:
 *   { "layout": "bullets", "content": { "title": "...", "bullets": ["a","b","c"] } }
 *   { "layout": "title",   "content": { "title": "...", "subtitle": "..." } }
 *   { "layout": "quote",   "content": { "title": "...", "quote": "...", "attribution": "..." } }
 *   { "layout": "stats",   "content": { "title": "...", "stats": [{"value":"42%","label":"Growth"}] } }
 *   { "layout": "two-column", "content": { "title":"...", "leftColumn":["a"], "rightColumn":["b"] } }
 *   { "layout": "content", "content": { "title": "...", "body": "..." } }
 *
 * Environment:
 *   WINGMAN_SERVER  — base URL of the server (default: http://localhost:3001)
 */

import { readFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = process.env.WINGMAN_SERVER ?? 'http://localhost:5173';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  }).catch(err => {
    console.error(`Could not reach Wingman server at ${SERVER}`);
    console.error('Run `wingman start` in another terminal first.');
    process.exit(1);
  });

  if (res.status === 204) return null;
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function makeId() {
  const now = Date.now();
  return `pres_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeSlideId() {
  const now = Date.now();
  return `slide_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1] ?? true;
      i++;
    }
  }
  return flags;
}

function positional(args) {
  return args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
}

// ── Commands ──────────────────────────────────────────────────────────────────

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  // ── start ──────────────────────────────────────────────────────────────────
  case 'start': {
    const serverPath = join(__dirname, '..', 'server', 'index.js');
    const { spawn } = await import('node:child_process');
    const child = spawn('node', [serverPath], { stdio: 'inherit' });
    child.on('exit', code => process.exit(code ?? 0));
    break;
  }

  // ── list ───────────────────────────────────────────────────────────────────
  case 'list': {
    const presentations = await api('GET', '/api/presentations');
    if (!Array.isArray(presentations)) {
      console.error('Server returned unexpected response. Is the dev server running? (npm run dev)');
      process.exit(1);
    }
    if (!presentations.length) {
      console.log('No presentations found. Create one with: wingman create "My Talk"');
      break;
    }
    console.log(`${'ID'.padEnd(32)}  ${'TITLE'.padEnd(40)}  SLIDES  THEME`);
    console.log('-'.repeat(90));
    for (const p of presentations) {
      const slides = p.slides?.length ?? 0;
      console.log(`${p.id.padEnd(32)}  ${p.title.slice(0, 40).padEnd(40)}  ${String(slides).padEnd(6)}  ${p.themeId}`);
    }
    break;
  }

  // ── create ─────────────────────────────────────────────────────────────────
  case 'create': {
    const flags = parseFlags(args);
    const titleParts = positional(args);
    const title = titleParts.join(' ');
    if (!title) {
      console.error('Usage: wingman create "My Talk Title" [--theme obsidian]');
      process.exit(1);
    }
    const now = Date.now();
    const presentation = {
      id: makeId(),
      title,
      slides: [],
      themeId: flags.theme ?? 'obsidian',
      fontFamily: flags.font ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    const created = await api('POST', '/api/presentations', presentation);
    console.log(`Created  ${created.id}  "${created.title}"`);
    console.log(`Edit:    ${SERVER}/edit/${created.id}`);
    break;
  }

  // ── show ───────────────────────────────────────────────────────────────────
  case 'show': {
    const [id] = args;
    if (!id) { console.error('Usage: wingman show <id>'); process.exit(1); }
    const p = await api('GET', `/api/presentations/${id}`);
    if (p?.error) { console.error(p.error); process.exit(1); }
    console.log(JSON.stringify(p, null, 2));
    break;
  }

  // ── add ────────────────────────────────────────────────────────────────────
  case 'add': {
    const [id, rawSlide] = args;
    if (!id || !rawSlide) {
      console.error('Usage: wingman add <id> \'{"layout":"bullets","content":{...}}\'');
      console.error('       wingman add <id> @slide.json');
      process.exit(1);
    }

    let slideData;
    try {
      const raw = rawSlide.startsWith('@') ? readFileSync(rawSlide.slice(1), 'utf8') : rawSlide;
      slideData = JSON.parse(raw);
    } catch (e) {
      console.error('Could not parse slide JSON:', e.message);
      process.exit(1);
    }

    const presentation = await api('GET', `/api/presentations/${id}`);
    if (presentation?.error) { console.error(presentation.error); process.exit(1); }

    const slide = {
      id: makeSlideId(),
      generatedAt: Date.now(),
      ...slideData,
    };

    presentation.slides.push(slide);
    presentation.updatedAt = Date.now();

    await api('PUT', `/api/presentations/${id}`, presentation);
    console.log(`Added slide  ${slide.id}  (${slide.layout})  →  "${slide.content?.title ?? ''}"`);
    console.log(`Presentation now has ${presentation.slides.length} slide(s).`);
    break;
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  case 'delete': {
    const [id] = args;
    if (!id) { console.error('Usage: wingman delete <id>'); process.exit(1); }
    await api('DELETE', `/api/presentations/${id}`);
    console.log(`Deleted ${id}`);
    break;
  }

  // ── open ───────────────────────────────────────────────────────────────────
  case 'open': {
    const [id] = args;
    const url = id ? `${SERVER}/edit/${id}` : SERVER;
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${opener} "${url}"`);
    console.log(`Opening ${url}`);
    break;
  }

  // ── help / default ─────────────────────────────────────────────────────────
  default: {
    console.log(`
Wingman — build presentations from the CLI

Commands:
  wingman start                      Start the local server
  wingman list                       List all presentations
  wingman create "Title" [--theme X] Create a new presentation
  wingman show <id>                  Print presentation JSON
  wingman add <id> '<json>'          Add a slide
  wingman add <id> @file.json        Add a slide from file
  wingman open [id]                  Open in browser
  wingman delete <id>                Delete a presentation

Slide layouts: title | bullets | content | quote | stats | two-column

Examples:
  wingman create "My AI Talk" --theme midnight
  wingman add pres_123 '{"layout":"title","content":{"title":"Hello World","subtitle":"A subtitle"}}'
  wingman add pres_123 '{"layout":"bullets","content":{"title":"Key Points","bullets":["Fast","Simple","Powerful"]}}'
  wingman open pres_123
`);
    break;
  }
}
