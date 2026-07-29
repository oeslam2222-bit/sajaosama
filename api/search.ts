import type { VercelRequest, VercelResponse } from '@vercel/node';

// Serverless proxy for Nominatim text search.
// Proxied to avoid browser CORS when calling nominatim.openstreetmap.org.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { q } = req.query as { q?: string };
  if (!q) {
    return res.status(400).json({ error: 'q is required' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      q
    )}&accept-language=ar&limit=6&addressdetails=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CaptainEzz-App/1.0 (ride booking)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'nominatim error' });
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'search failed' });
  }
}
