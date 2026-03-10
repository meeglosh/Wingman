#!/usr/bin/env node
/**
 * Wingman CLI — full control over presentations and slides
 *
 * Presentation commands:
 *   wingman list
 *   wingman create "Title" [--theme <id>] [--font <family>]
 *   wingman show <id>
 *   wingman set <id> [--title "New Title"] [--theme <id>] [--font <family>]
 *   wingman delete <id>
 *   wingman open [id]
 *
 * Slide commands:
 *   wingman add <id> '<json>' [--at <index>]
 *   wingman add <id> @file.json [--at <index>]
 *   wingman update <id> <slide-id> '<json>'
 *   wingman remove <id> <slide-id>
 *   wingman move <id> <slide-id> <new-index>
 *   wingman slides <id>
 *
 * Meta:
 *   wingman themes
 *   wingman start
 *
 * Slide JSON shape:
 *   { "layout": "title",      "content": { "title": "...", "subtitle": "..." } }
 *   { "layout": "bullets",    "content": { "title": "...", "bullets": ["a","b"] } }
 *   { "layout": "content",    "content": { "title": "...", "body": "..." } }
 *   { "layout": "quote",      "content": { "title": "...", "quote": "...", "attribution": "..." } }
 *   { "layout": "stats",      "content": { "title": "...", "stats": [{"value":"42%","label":"Growth"}] } }
 *   { "layout": "two-column", "content": { "title": "...", "leftColumn": ["a"], "rightColumn": ["b"] } }
 *
 * Environment:
 *   WINGMAN_SERVER  base URL of the running server (default: http://localhost:5173)
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
  }).catch(() => {
    console.error(`Could not reach Wingman server at ${SERVER}`);
    console.error('Run `wingman start` (or npm run dev) first.');
    process.exit(1);
  });
  if (res.status === 204) return null;
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function getPresentation(id) {
  const p = await api('GET', `/api/presentations/${id}`);
  if (p?.error) { console.error(`Presentation not found: ${id}`); process.exit(1); }
  return p;
}

async function putPresentation(presentation) {
  return api('PUT', `/api/presentations/${presentation.id}`, presentation);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  const result = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; }
    result.push(args[i]);
  }
  return result;
}

function parseSlideJson(raw) {
  try {
    const src = raw.startsWith('@') ? readFileSync(raw.slice(1), 'utf8') : raw;
    return JSON.parse(src);
  } catch (e) {
    console.error('Could not parse slide JSON:', e.message);
    process.exit(1);
  }
}

// ── Commands ──────────────────────────────────────────────────────────────────

const [, , cmd, ...args] = process.argv;

switch (cmd) {

  // ── start ──────────────────────────────────────────────────────────────────
  case 'start': {
    const { spawn } = await import('node:child_process');
    const child = spawn('node', [join(__dirname, '..', 'server', 'dev.js')], { stdio: 'inherit' });
    child.on('exit', code => process.exit(code ?? 0));
    break;
  }

  // ── list ───────────────────────────────────────────────────────────────────
  case 'list': {
    const all = await api('GET', '/api/presentations');
    if (!Array.isArray(all)) { console.error('Server returned unexpected response. Is it running?'); process.exit(1); }
    if (!all.length) { console.log('No presentations. Try: wingman create "My Talk"'); break; }
    console.log(`${'ID'.padEnd(32)}  ${'TITLE'.padEnd(40)}  SLIDES  THEME`);
    console.log('─'.repeat(90));
    for (const p of all) {
      console.log(`${p.id.padEnd(32)}  ${p.title.slice(0, 40).padEnd(40)}  ${String(p.slides?.length ?? 0).padEnd(6)}  ${p.themeId}`);
    }
    break;
  }

  // ── create ─────────────────────────────────────────────────────────────────
  case 'create': {
    const flags = parseFlags(args);
    const title = positional(args).join(' ');
    if (!title) { console.error('Usage: wingman create "Title" [--theme <id>]'); process.exit(1); }
    const now = Date.now();
    const p = { id: makeId('pres'), title, slides: [], themeId: flags.theme ?? 'obsidian', fontFamily: flags.font, createdAt: now, updatedAt: now };
    const created = await api('POST', '/api/presentations', p);
    console.log(`Created  ${created.id}`);
    console.log(`Title    "${created.title}"  theme:${created.themeId}`);
    console.log(`Edit     ${SERVER}/edit/${created.id}`);
    break;
  }

  // ── show ───────────────────────────────────────────────────────────────────
  case 'show': {
    const [id] = positional(args);
    if (!id) { console.error('Usage: wingman show <id>'); process.exit(1); }
    const p = await getPresentation(id);
    console.log(JSON.stringify(p, null, 2));
    break;
  }

  // ── set ────────────────────────────────────────────────────────────────────
  case 'set': {
    const [id] = positional(args);
    if (!id) { console.error('Usage: wingman set <id> [--title X] [--theme X] [--font X]'); process.exit(1); }
    const flags = parseFlags(args);
    const p = await getPresentation(id);
    if (flags.title) p.title = flags.title;
    if (flags.theme) p.themeId = flags.theme;
    if (flags.font)  p.fontFamily = flags.font;
    await putPresentation(p);
    console.log(`Updated  ${p.id}  "${p.title}"  theme:${p.themeId}`);
    break;
  }

  // ── slides ─────────────────────────────────────────────────────────────────
  case 'slides': {
    const [id] = positional(args);
    if (!id) { console.error('Usage: wingman slides <id>'); process.exit(1); }
    const p = await getPresentation(id);
    if (!p.slides.length) { console.log('No slides.'); break; }
    console.log(`${'#'.padEnd(4)}  ${'SLIDE ID'.padEnd(32)}  ${'LAYOUT'.padEnd(12)}  TITLE`);
    console.log('─'.repeat(80));
    p.slides.forEach((s, i) => {
      console.log(`${String(i).padEnd(4)}  ${s.id.padEnd(32)}  ${s.layout.padEnd(12)}  ${s.content?.title ?? ''}`);
    });
    break;
  }

  // ── add ────────────────────────────────────────────────────────────────────
  case 'add': {
    const [id, rawSlide] = positional(args);
    if (!id || !rawSlide) { console.error('Usage: wingman add <id> \'<json>\' [--at <index>]'); process.exit(1); }
    const flags = parseFlags(args);
    const p = await getPresentation(id);
    const slide = { id: makeId('slide'), generatedAt: Date.now(), ...parseSlideJson(rawSlide) };
    const at = flags.at != null ? parseInt(flags.at) : p.slides.length;
    p.slides.splice(at, 0, slide);
    p.updatedAt = Date.now();
    await putPresentation(p);
    console.log(`Added    ${slide.id}  (${slide.layout})  →  "${slide.content?.title ?? ''}"  at index ${at}`);
    console.log(`Total    ${p.slides.length} slide(s)`);
    break;
  }

  // ── update ─────────────────────────────────────────────────────────────────
  case 'update': {
    const [id, slideId, rawSlide] = positional(args);
    if (!id || !slideId || !rawSlide) { console.error('Usage: wingman update <id> <slide-id> \'<json>\''); process.exit(1); }
    const p = await getPresentation(id);
    const idx = p.slides.findIndex(s => s.id === slideId);
    if (idx < 0) { console.error(`Slide not found: ${slideId}`); process.exit(1); }
    p.slides[idx] = { ...p.slides[idx], ...parseSlideJson(rawSlide), id: slideId };
    p.updatedAt = Date.now();
    await putPresentation(p);
    console.log(`Updated  ${slideId}  (${p.slides[idx].layout})  →  "${p.slides[idx].content?.title ?? ''}"`);
    break;
  }

  // ── remove ─────────────────────────────────────────────────────────────────
  case 'remove': {
    const [id, slideId] = positional(args);
    if (!id || !slideId) { console.error('Usage: wingman remove <id> <slide-id>'); process.exit(1); }
    const p = await getPresentation(id);
    const before = p.slides.length;
    p.slides = p.slides.filter(s => s.id !== slideId);
    if (p.slides.length === before) { console.error(`Slide not found: ${slideId}`); process.exit(1); }
    p.updatedAt = Date.now();
    await putPresentation(p);
    console.log(`Removed  ${slideId}`);
    console.log(`Total    ${p.slides.length} slide(s)`);
    break;
  }

  // ── move ───────────────────────────────────────────────────────────────────
  case 'move': {
    const [id, slideId, newIndexStr] = positional(args);
    if (!id || !slideId || newIndexStr == null) { console.error('Usage: wingman move <id> <slide-id> <new-index>'); process.exit(1); }
    const p = await getPresentation(id);
    const from = p.slides.findIndex(s => s.id === slideId);
    if (from < 0) { console.error(`Slide not found: ${slideId}`); process.exit(1); }
    const to = Math.max(0, Math.min(parseInt(newIndexStr), p.slides.length - 1));
    const [slide] = p.slides.splice(from, 1);
    p.slides.splice(to, 0, slide);
    p.updatedAt = Date.now();
    await putPresentation(p);
    console.log(`Moved    ${slideId}  ${from} → ${to}`);
    break;
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  case 'delete': {
    const [id] = positional(args);
    if (!id) { console.error('Usage: wingman delete <id>'); process.exit(1); }
    await api('DELETE', `/api/presentations/${id}`);
    console.log(`Deleted  ${id}`);
    break;
  }

  // ── open ───────────────────────────────────────────────────────────────────
  case 'open': {
    const [id] = positional(args);
    const url = id ? `${SERVER}/edit/${id}` : SERVER;
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${opener} "${url}"`);
    console.log(`Opening  ${url}`);
    break;
  }

  // ── themes ─────────────────────────────────────────────────────────────────
  case 'themes': {
    const themes = [
      { id: 'obsidian', desc: 'Dark purple gradient' },
      { id: 'arctic',   desc: 'Light blue / white' },
      { id: 'midnight', desc: 'Near-black with gold accents' },
      { id: 'ember',    desc: 'Dark brown with orange accents' },
      { id: 'forest',   desc: 'Deep green' },
      { id: 'slate',    desc: 'Dark blue-grey with sky blue accents' },
      { id: 'neon',     desc: 'Near-black with electric cyan accents' },
      { id: 'rose',     desc: 'Deep dark with hot pink accents' },
      { id: 'paper',    desc: 'Warm off-white, terracotta accent' },
    ];
    console.log(`${'ID'.padEnd(12)}  DESCRIPTION`);
    console.log('─'.repeat(50));
    themes.forEach(t => console.log(`${t.id.padEnd(12)}  ${t.desc}`));
    break;
  }

  // ── help / default ─────────────────────────────────────────────────────────
  default: {
    console.log(`
Wingman — build and control presentations from the CLI

Presentation:
  wingman list                              List all presentations
  wingman create "Title" [--theme X]        Create a presentation
  wingman show <id>                         Print full JSON
  wingman set <id> [--title X] [--theme X]  Update metadata
  wingman delete <id>                       Delete a presentation
  wingman open [id]                         Open in browser

Slides:
  wingman slides <id>                       List slides with IDs
  wingman add <id> '<json>' [--at N]        Add a slide (append or insert)
  wingman update <id> <slide-id> '<json>'   Replace a slide's content
  wingman remove <id> <slide-id>            Delete a slide
  wingman move <id> <slide-id> <index>      Reorder a slide

Other:
  wingman themes                            List available themes
  wingman start                             Start the local server

Slide layouts: title | bullets | content | quote | stats | two-column
`);
    break;
  }
}
