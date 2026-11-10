import { RideStore } from './store.mjs';

// Keep the demo's validated state machine, but persist its state and heartbeats
// together. The database lock coordinates separate Vercel function instances.
export function createPostgresStorage(pool) {
  return async work => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      // Also protects first-use table creation when instances cold-start together.
      await client.query('SELECT pg_advisory_xact_lock(1297045057)');
      await client.query(`CREATE TABLE IF NOT EXISTS mova_ride_state (
        id integer PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL
      )`);
      await client.query(`INSERT INTO mova_ride_state (id, payload)
        VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`);
      const {rows} = await client.query('SELECT payload FROM mova_ride_state WHERE id = 1 FOR UPDATE');
      const payload = rows[0].payload;
      const store = new RideStore(null);
      if (payload.data) {
        if (payload.data.schema !== 1 || !Array.isArray(payload.data.sessions) || !Array.isArray(payload.data.rides)) {
          throw new Error('Unsupported hosted ride database.');
        }
        store.data = payload.data;
      }
      store.seen = new Map(payload.seen || []);
      const rates = new Map(payload.rates || []);
      const result = await work({store, rates});
      const cutoff = Date.now() - 60000;
      await client.query('UPDATE mova_ride_state SET payload = $1::jsonb WHERE id = 1', [JSON.stringify({
        data:store.data,
        seen:[...store.seen].filter(([, at]) => at > cutoff),
        rates:[...rates].filter(([, bucket]) => bucket.at > cutoff)
      })]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  };
}
