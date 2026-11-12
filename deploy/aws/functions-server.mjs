// Uruchamia funkcje z /api (pisane pod Vercel) jako zwykły serwer HTTP.
// Caddy kieruje tu tylko ścieżki, dla których istnieje plik api/<nazwa>.js.
import http from 'node:http';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../api');
const PORT = Number(process.env.FN_PORT || 8766);

const handlers = {};
for (const f of readdirSync(API_DIR)) {
  if (!f.endsWith('.js') || f.startsWith('_')) continue;
  handlers[f.slice(0, -3)] = (await import(pathToFileURL(path.join(API_DIR, f)))).default;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = handlers[url.pathname.replace(/^\/api\//, '').replace(/\/$/, '')];
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  if (!handler) return res.status(404).json({ error: 'not found' });
  req.query = Object.fromEntries(url.searchParams);
  try {
    await handler(req, res);
  } catch (e) {
    console.error(url.pathname, e);
    if (!res.headersSent) res.status(500).json({ error: 'internal error' });
    else res.end();
  }
}).listen(PORT, '127.0.0.1', () => console.log(`functions: ${Object.keys(handlers).join(', ')} on :${PORT}`));
