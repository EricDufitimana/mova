import pg from 'pg';
import { createPostgresStorage } from '../server/postgres.mjs';
import { createHostedApi } from '../server/hosted-api.mjs';

let handler;
export default async function ride(req, res) {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    res.writeHead(503, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
    return res.end(JSON.stringify({error:'Hosted ride storage is not configured. Connect a Postgres database to this Vercel project and redeploy.'}));
  }
  if (!handler) {
    const pool = new pg.Pool({connectionString, max:3, connectionTimeoutMillis:5000, idleTimeoutMillis:10000, allowExitOnIdle:true});
    pool.on('error', error => console.error('Ride database connection:', error.code || error.name));
    handler = createHostedApi(createPostgresStorage(pool));
  }
  return handler(req, res);
}
