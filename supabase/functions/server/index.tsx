import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-21013d34/health", (c) => {
  return c.json({ status: "ok" });
});

// ── Unsplash image proxy ────────────────────────────────────────────────────
app.get("/make-server-8474fcb9/unsplash", async (c) => {
  const q = c.req.query("q") || "professional presentation";
  const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!key) {
    console.log("UNSPLASH_ACCESS_KEY not configured");
    return c.json({ error: "UNSPLASH_ACCESS_KEY not configured" }, 500);
  }
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=landscape&per_page=5&order_by=relevant`,
      { headers: { Authorization: `Client-ID ${key}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      console.log("Unsplash API error:", res.status, text);
      return c.json({ error: `Unsplash API error: ${res.status}` }, 502);
    }
    const data = await res.json();
    const results = data.results ?? [];
    const idx = Math.floor(Math.random() * Math.min(results.length, 5));
    const photo = results[idx];
    if (!photo) return c.json({ url: null });
    return c.json({
      url: photo.urls?.regular ?? photo.urls?.full,
      alt: photo.alt_description ?? q,
      credit: {
        name: photo.user?.name ?? "Unknown",
        profileUrl: `${photo.user?.links?.html ?? "https://unsplash.com"}?utm_source=wingman&utm_medium=referral`,
      },
    });
  } catch (e) {
    console.log("Unsplash proxy error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── AI Slide Generator ──────────────────────────────────────────────────────
app.post("/make-server-8474fcb9/generate-slide", async (c) => {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.log("OPENAI_API_KEY not configured");
    return c.json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  let body: { transcript: string; presentationTitle: string; previousSlideTitles: string[] };
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const { transcript, presentationTitle, previousSlideTitles = [] } = body;
  if (!transcript || transcript.trim().length < 5) {
    return c.json({ error: "Transcript too short" }, 400);
  }

  const systemPrompt = `You are a professional presentation slide generator for a tool called Wingman.
Your job is to convert raw speech transcripts into polished, structured slide content.

Return ONLY a valid JSON object — no markdown, no explanation — with this shape:
{
  "layout": "title" | "content" | "bullets" | "quote" | "stats" | "two-column",
  "title": "<max 8 words, punchy noun-phrase>",
  "subtitle": "<optional, only for title layout>",
  "body": "<optional, 1–2 sentences, only for content layout when there are no bullets>",
  "bullets": ["<max 12 words>", ...],
  "quote": "<the verbatim or cleaned quote text>",
  "attribution": "<optional speaker/source name>",
  "stats": [{"value": "<number+unit>", "label": "<short description>"}],
  "leftColumn": ["<item>", ...],
  "rightColumn": ["<item>", ...]
}

LAYOUT RULES (pick the best fit):
- "stats"      → 2+ specific numbers, percentages, dollar figures, or measurable metrics exist
- "quote"      → a direct quotation, attributed statement, or powerful single sentence stands out
- "bullets"    → 4+ distinct points, steps, or ideas to convey
- "two-column" → comparing two things, pros/cons, before/after, or two groups of related items
- "content"    → general explanation with 2–3 supporting points
- "title"      → section header, single concept, or transition moment

CONTENT RULES:
- Title: strong noun phrase, no filler, no punctuation at the end
- Bullets: start with a verb or strong noun, be specific, no trailing periods, max 12 words each
- Stats value: include the unit (%, $, x, M, etc.). Label: 3–6 words describing what it measures
- Strip all filler words: um, uh, like, you know, basically, actually, literally, right, okay, so
- Only include fields that belong to the chosen layout (omit irrelevant fields entirely)
- Aim for 3–5 bullets, 2–4 stats, or 1 strong quote`;

  const userPrompt = `Presentation title: "${presentationTitle}"
Previous slide titles: ${previousSlideTitles.length ? previousSlideTitles.join(' → ') : '(none yet)'}
Speech transcript to convert: "${transcript}"`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 600,
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log("OpenAI API error:", res.status, errText);
      return c.json({ error: `OpenAI error ${res.status}: ${errText}` }, 502);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      console.log("OpenAI returned empty content");
      return c.json({ error: "Empty response from OpenAI" }, 502);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.log("Failed to parse OpenAI JSON:", raw);
      return c.json({ error: "Could not parse OpenAI response as JSON" }, 502);
    }

    // Validate required fields
    const layout = parsed.layout as string;
    const validLayouts = ["title", "content", "bullets", "quote", "stats", "two-column"];
    if (!validLayouts.includes(layout)) {
      parsed.layout = "content";
    }
    if (!parsed.title || typeof parsed.title !== "string") {
      parsed.title = "New Slide";
    }

    console.log("Generated slide:", JSON.stringify({ layout: parsed.layout, title: parsed.title }));
    return c.json({ layout: parsed.layout, content: parsed });
  } catch (e) {
    console.log("Slide generation error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Whisper Audio Transcription ──────────────────────────────────────────────
app.post("/make-server-8474fcb9/transcribe", async (c) => {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.log("OPENAI_API_KEY not configured for transcribe");
    return c.json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch (e) {
    console.log("Transcribe: invalid form data:", e);
    return c.json({ error: "Invalid form data" }, 400);
  }

  const audio = formData.get("audio");
  if (!audio || !(audio instanceof File)) {
    return c.json({ error: "No audio file provided" }, 400);
  }

  // Skip obviously silent/empty blobs
  if (audio.size < 1000) {
    return c.json({ text: "" });
  }

  const whisperForm = new FormData();
  whisperForm.append("file", audio, audio.name || "audio.webm");
  whisperForm.append("model", "whisper-1");
  whisperForm.append("language", "en");
  whisperForm.append("response_format", "json");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log("Whisper API error:", res.status, errText);
      return c.json({ error: `Whisper error ${res.status}: ${errText}` }, 502);
    }

    const data = await res.json();
    const text = (data.text ?? "").trim();
    console.log("Whisper transcript:", text.substring(0, 120));
    return c.json({ text });
  } catch (e) {
    console.log("Whisper transcription error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

Deno.serve(app.fetch);