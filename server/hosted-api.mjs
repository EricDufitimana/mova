import { createApi } from './api.mjs';

export function createHostedApi(withStore) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://mova.invalid');
      const route = req.query?.__mova_path ?? url.searchParams.get('__mova_path');
      if (route !== null) {
        if (typeof route !== 'string' || !/^[\w/-]{1,200}$/.test(route)) {
          res.writeHead(400, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
          return res.end(JSON.stringify({error:'Invalid API route.'}));
        }
        req.url = `/api/${route}`;
      }
      // Buffer the API result until the database commit succeeds. Never issue a
      // session token or acknowledge a ride that has not been durably saved.
      const reply = await withStore(async ({store, rates}) => {
        const buffered = {
          headersSent:false,
          writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
          end(body) { this.body = body; }
        };
        await createApi({store, rates, publicUrls:[`https://${req.headers.host}`]})(req, buffered, () => {
          buffered.writeHead(404, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
          buffered.end(JSON.stringify({error:'API route not found.'}));
        });
        return buffered;
      });
      res.writeHead(reply.status, reply.headers);
      res.end(reply.body);
    } catch (error) {
      // Avoid logging connection strings or database errors containing user data.
      console.error('Hosted ride API unavailable:', error.code || error.name);
      res.writeHead(503, {'Content-Type':'application/json', 'Cache-Control':'no-store', 'Retry-After':'5'});
      res.end(JSON.stringify({error:'The shared ride server is unavailable. Please try again shortly.'}));
    }
  };
}
