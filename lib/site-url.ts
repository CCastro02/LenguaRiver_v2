/**
 * Used for absolute metadata URLs (Open Graph, manifest icons on some clients).
 * Set NEXT_PUBLIC_SITE_URL in Vercel (e.g. https://your-app.vercel.app).
 */
export function getSiteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return new URL(explicit);
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    const host = vercel.startsWith("http") ? vercel : `https://${vercel}`;
    return new URL(host);
  }
  return new URL("http://localhost:3000");
}
