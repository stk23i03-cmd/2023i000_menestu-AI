import https from 'https';
import fs from 'fs';

7

import next from 'next';
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = process.env.FRONTEND_PORT || 3001;
const CERT = process.env.SSL_CERT_FILE || './cert.pem';
const KEY = process.env.SSL_KEY_FILE || './key.pem';
await app.prepare();
const server = https.createServer({
  cert: fs.readFileSync(CERT),
  key: fs.readFileSync(KEY),
}, (req, res) => handle(req, res));
server.listen(PORT, () => {
  console.log(`> Frontend ready on https://localhost:${PORT}`);
});