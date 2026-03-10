export interface UnsplashPhoto {
  url: string;
  alt: string;
  credit: { name: string; profileUrl: string };
}

/**
 * Fetch a background image for a slide.
 * Stub: returns null until an image API is wired up.
 * To add image generation, implement this function with OpenAI/Gemini/Unsplash.
 */
export async function fetchUnsplashImage(_query: string): Promise<UnsplashPhoto | null> {
  return null;
}
