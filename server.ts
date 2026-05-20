/**
 * Local-dev server: Next.js + Socket.IO signaling on the same port.
 *
 * The Socket.IO setup is delegated to `signaling/server.ts` so the same
 * room/relay logic runs in production (deployed standalone on Cloud Run)
 * and there is no chance of dev and prod diverging.
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { attachSignaling } from './signaling/server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  attachSignaling(httpServer);

  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
