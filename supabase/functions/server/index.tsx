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
    // Pick a random one from top 5 to add variety
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

Deno.serve(app.fetch);