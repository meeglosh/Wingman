import { projectId, publicAnonKey } from '/utils/supabase/info';

export interface UnsplashPhoto {
  url: string;
  thumbUrl?: string;
  alt: string;
  credit: { name: string; profileUrl: string };
}

export async function fetchUnsplashImage(query: string): Promise<UnsplashPhoto | null> {
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-8474fcb9/unsplash?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } },
    );
    if (!res.ok) {
      console.log('Unsplash fetch failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    if (!data.url) return null;
    return data as UnsplashPhoto;
  } catch (e) {
    console.log('Unsplash fetch error:', e);
    return null;
  }
}

export async function searchUnsplashImages(query: string): Promise<UnsplashPhoto[]> {
  const base = `https://${projectId}.supabase.co/functions/v1/make-server-8474fcb9/unsplash`;
  const headers = { Authorization: `Bearer ${publicAnonKey}` };
  const q = encodeURIComponent(query);

  // Try the updated multi-result endpoint first (requires edge function redeployment)
  try {
    const res = await fetch(`${base}?q=${q}&multiple=true`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data as UnsplashPhoto[];
    }
  } catch {}

  // Fallback: fire 10 parallel single-photo requests and deduplicate by URL.
  // The edge function picks randomly from the top 5 Unsplash results each time,
  // so parallel calls reliably surface 4–5 distinct photos without redeployment.
  try {
    const calls = Array.from({ length: 10 }, () =>
      fetch(`${base}?q=${q}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then((d: any) => (d?.url ? (d as UnsplashPhoto) : null))
        .catch(() => null),
    );
    const settled = await Promise.all(calls);
    const photos = settled.filter((p): p is UnsplashPhoto => !!p?.url);
    // Deduplicate by URL
    return photos.filter((p, i) => photos.findIndex(o => o.url === p.url) === i);
  } catch {
    return [];
  }
}
