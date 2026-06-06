export default async function handler(req, res) {
  const target = process.env.VITE_API_URL || 'https://stockstracker.onrender.com';
  try {
    const resp = await fetch(`${target}/api/health`, {
      signal: AbortSignal.timeout(10000),
    });
    res.status(200).json({ pinged: target, status: resp.status, ok: resp.ok });
  } catch (err) {
    res.status(200).json({ pinged: target, error: err.message });
  }
}
