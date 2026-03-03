import { projectId, publicAnonKey } from '/utils/supabase/info';

export interface UnsplashPhoto {
  url: string;
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
