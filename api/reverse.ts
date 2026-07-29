import type { VercelRequest, VercelResponse } from '@vercel/node';

// Serverless proxy for Nominatim reverse geocoding.
// The browser cannot call nominatim.openstreetmap.org directly because of CORS,
// so we proxy the request from our own origin (ezzcaptian.vercel.app).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { lat, lon } = req.query as { lat?: string; lon?: string };
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lon)}&accept-language=ar&zoom=18&addressdetails=1`;

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
    return res.status(502).json({ error: 'reverse geocoding failed' });
  }
}
