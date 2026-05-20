/**
 * Standalone signaling entrypoint — runs alone on Cloud Run / Railway /
 * Fly.io. No Next.js. Reads PORT from the platform env (Cloud Run injects
 * it) and CORS_ORIGIN to restrict to the App Hosting domain in production.
 */

import { createServer } from 'http';
import { attachSignaling } from './server';

const port = Number(process.env.PORT ?? 8080);
const corsOrigin = process.env.CORS_ORIGIN ?? '*';

const httpServer = createServer((req, res) => {
  // Tiny health endpoint so Cloud Run's startup probe is happy.
  if (req.url === '/healthz') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('ok');
    return;
  }
  res.statusCode = 404;
  res.end('signaling — use socket.io client');
});

attachSignaling(httpServer, { corsOrigin });

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[signaling] listening on :${port} · cors=${corsOrigin}`);
});
