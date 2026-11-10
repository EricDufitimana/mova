import { networkInterfaces } from 'node:os';
import { RideStore, RideError } from './store.mjs';
import { resolve } from 'node:path';

export function createApi({ file = resolve(process.env.MOVA_STORE || '.mova/ride-store.json'), store = new RideStore(file) } = {}) {
  const rates = new Map();
  const limited = key => {
    const now = Date.now(), bucket = rates.get(key);
    if (!bucket || now - bucket.at > 60000) { rates.set(key, {at: now, n: 1}); return; }
    if (++bucket.n > 100) throw new RideError(429, 'Too many requests. Please wait one minute.');
    if (rates.size > 10000) for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);
  };
  return async (req, res, next) => {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/api/')) return next?.();
    const send = (status, body) => { res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(body)); };
    try {
      let input = {};
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw new RideError(403, 'Use this app’s own server to make changes.');
        limited(`${req.socket.remoteAddress}:write`);
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 49152) throw new RideError(413, 'Request too large.'); }
        try { input = JSON.parse(raw || '{}'); } catch { throw new RideError(400, 'Invalid JSON.'); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RideError(400, 'Expected an object.');
      }
      if (req.method === 'GET' && path === '/api/info') {
        const port = Number(req.headers.host?.match(/:(\d+)$/)?.[1]) || 80;
        const urls = Object.values(networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal).map(n => `http://${n.address}:${port}`);
        return send(200, { urls });
      }
      if (req.method === 'POST' && path === '/api/session') return send(201, store.rider());
      if (req.method === 'POST' && path === '/api/driver/select') return send(201, store.selectDriver(input.vehicleId, input.deviceToken));
      if (req.method === 'POST' && path === '/api/driver/redeem') {
        if (!input.deviceToken) throw new RideError(400, 'A driver device key is required.');
        return send(201, store.redeem(input.code, input.deviceToken));
      }
      const actor = store.actor(req.headers.authorization?.replace(/^Bearer /, ''));
      if (req.method === 'GET' && path === '/api/state') return send(200, store.snapshot(actor));
      if (req.method === 'POST' && path === '/api/driver/invite') return send(201, store.invite(actor, input.vehicleId));
      if (req.method === 'POST' && path === '/api/driver/release') return send(200, store.release(actor));
      const requestId = req.headers['x-request-id'];
      if (req.method === 'POST' && path === '/api/rides') return send(201, store.create(actor, input, requestId));
      const match = path.match(/^\/api\/rides\/([\w-]+)\/action$/);
      if (req.method === 'POST' && match) return send(200, store.act(actor, match[1], input, requestId));
      throw new RideError(404, 'API route not found.');
    } catch (error) {
      if (!(error instanceof RideError)) console.error('Ride API:', error);
      if (!res.headersSent) send(error.status || 500, {error: error.status ? error.message : 'Could not save the change. Please retry.'});
    }
  };
}
