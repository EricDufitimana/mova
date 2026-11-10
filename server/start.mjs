import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createApi } from './api.mjs';
const root = resolve(process.env.MOVA_DIST || 'dist');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Run npm run build before npm start.');
const api = createApi();
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon'};
createServer((req, res) => api(req, res, () => {
  let path;
  try { path = resolve(root, `.${decodeURIComponent(req.url.split('?')[0])}`); } catch { res.writeHead(400); return res.end(); }
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  if (!existsSync(path) || !statSync(path).isFile()) path = resolve(root, 'index.html');
  res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff'});
  createReadStream(path).pipe(res);
})).listen(Number(process.env.PORT) || 5173, '0.0.0.0', () => console.log(`Mova shared ride server: http://localhost:${process.env.PORT || 5173}`));
