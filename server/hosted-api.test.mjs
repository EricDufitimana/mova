import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresStorage } from './postgres.mjs';
import { createHostedApi } from './hosted-api.mjs';
import vercelHandler from '../api/ride.js';

test('hosted API persists driver selection, presence and ride changes across independent requests', async t => {
  const db = new PGlite();
  const pool = {connect:async () => ({query:(...args) => db.query(...args), release() {}})};
  const storage = createPostgresStorage(pool);
  const server = createServer((req, res) => createHostedApi(storage)(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, {body, token, id} = {}) => {
    // Exercise the same route rewriting used by vercel.json, including nested routes.
    const response = await fetch(`${base}/api/ride?__mova_path=${path}`, {
      method:body ? 'POST' : 'GET',
      headers:{...(body ? {'Content-Type':'application/json', Origin:base} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(id ? {'X-Request-ID':id} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})
    });
    return {status:response.status, data:await response.json()};
  };

  const deviceToken = 'a'.repeat(64);
  const selected = await call('driver/select', {body:{vehicleId:'mv-201', deviceToken}});
  assert.equal(selected.status, 201);
  assert.equal(selected.data.token, deviceToken);
  const repeated = await call('driver/select', {body:{vehicleId:'mv-201', deviceToken}});
  assert.equal(repeated.data.token, deviceToken);
  const takeover = await call('driver/select', {body:{vehicleId:'mv-201', deviceToken:'b'.repeat(64)}});
  assert.equal(takeover.status, 409);

  const customer = await call('session', {body:{}});
  assert.equal(customer.status, 201);
  const token = customer.data.token;
  const state = await call('state', {token});
  assert.equal(state.status, 200);
  assert.equal(state.data.vehicles.find(v => v.id === 'mv-201').online, true);
  const ride = await call('rides', {token, id:'hosted-ride-0001', body:{
    vehicleId:'mv-201', pickup:'ASYV main gate', destination:'Ntunga market', fareMode:'normal', paymentMethod:'Cash',
    pickupCoords:{lat:-2.0329, lng:30.3838}
  }});
  assert.equal(ride.status, 201, JSON.stringify(ride.data));
  const driverState = await call('state', {token:deviceToken});
  assert.equal(driverState.data.vehicleId, 'mv-201');
  assert.equal(driverState.data.rides[0].id, ride.data.ride.id);
  const switched = await call('driver/select', {body:{vehicleId:'mv-202', deviceToken}});
  assert.equal(switched.status, 409);
  const privateState = await call('state', {token:'c'.repeat(64)});
  assert.equal(privateState.status, 401);

  const cancelled = await call(`rides/${ride.data.ride.id}/action`, {token, id:'hosted-cancel-0001', body:{
    action:'cancel', version:ride.data.ride.version, reason:'Testing the hosted backend.'
  }});
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  const released = await call('driver/release', {token:deviceToken, body:{}});
  assert.equal(released.status, 200);
  const afterRelease = await call('state', {token:deviceToken});
  assert.equal(afterRelease.status, 401);

  // Failed transactions must not leave a new session behind.
  const before = (await db.query('SELECT payload FROM mova_ride_state')).rows[0].payload;
  await assert.rejects(storage(({store}) => { store.rider(); throw new Error('Simulated failure'); }));
  const after = (await db.query('SELECT payload FROM mova_ride_state')).rows[0].payload;
  assert.deepEqual(after, before);

  // Rate limits must survive between function instances too.
  after.rates[0][1].n = 100;
  after.rates[0][1].at = Date.now();
  await db.query('UPDATE mova_ride_state SET payload = $1::jsonb WHERE id = 1', [JSON.stringify(after)]);
  assert.equal((await call('driver/select', {body:{vehicleId:'mv-202', deviceToken}})).status, 429);
  const info = await call('info');
  assert.equal(info.status, 200);
  assert.deepEqual(info.data.urls, [`https://127.0.0.1:${server.address().port}`]);
});

test('hosted API accepts Vercel rewrite query helpers and keeps API validation', async () => {
  const { RideStore } = await import('./store.mjs');
  const handler = createHostedApi(work => work({store:new RideStore(null), rates:new Map()}));
  const req = {url:'/api/ride', query:{__mova_path:'driver/select'}, method:'POST',
    headers:{host:'mova.example'}, socket:{remoteAddress:'test'},
    async *[Symbol.asyncIterator]() { yield JSON.stringify({vehicleId:'unknown', deviceToken:'a'.repeat(64)}); }};
  const reply = {writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); }};
  await handler(req, reply);
  assert.equal(reply.status, 400);
  assert.match(reply.body.error, /known plate/);
});

test('hosted API never acknowledges a mutation when the database commit fails', async () => {
  const req = {url:'/api/session', method:'POST', headers:{host:'mova.example'}, socket:{remoteAddress:'test'},
    async *[Symbol.asyncIterator]() { yield '{}'; }};
  const reply = {writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); }};
  const { RideStore } = await import('./store.mjs');
  const handler = createHostedApi(async work => {
    await work({store:new RideStore(null), rates:new Map()});
    throw new Error('Commit failed');
  });
  await handler(req, reply);
  assert.equal(reply.status, 503);
  assert.equal(reply.body.token, undefined);
});

test('Vercel API reports missing hosted storage instead of creating ephemeral sessions', async () => {
  const savedDatabase = process.env.DATABASE_URL, savedPostgres = process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  try {
    const reply = {writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); }};
    await vercelHandler({url:'/api/info'}, reply);
    assert.equal(reply.status, 503);
    assert.match(reply.body.error, /Connect a Postgres database/);
  } finally {
    if (savedDatabase !== undefined) process.env.DATABASE_URL = savedDatabase;
    if (savedPostgres !== undefined) process.env.POSTGRES_URL = savedPostgres;
  }
});
