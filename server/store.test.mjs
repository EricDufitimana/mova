import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { RideStore } from './store.mjs';
import { ASYV, NTUNGA, SEEDS, vehicleOrigin, distanceKm } from '../src/data.js';

function setup(file) {
  let now = Date.now();
  const store = new RideStore(file, () => now);
  const riderToken = store.rider().token;
  const rider = () => store.actor(riderToken);
  const invite = store.invite(rider(), 'mv-201');
  const driverToken = store.redeem(invite.code).token;
  const driver = () => store.actor(driverToken);
  let ride;
  const create = (overrides = {}, key = randomUUID()) => {
    ride = store.create(rider(), {vehicleId:'mv-201', pickup:'Kigali city centre', destination:'Remera', fareMode:'normal', paymentMethod:'Cash', ...overrides}, key).ride;
    return ride;
  };
  const act = (who, action, extra = {}, key = randomUUID()) => {
    ride = store.act(who(), ride.id, {action, version:ride.version, ...extra}, key).ride;
    return ride;
  };
  const start = () => { create(); act(driver, 'accept', {offerId:ride.offer.id}); act(driver, 'en_route'); act(driver, 'arrive'); const pin = store.snapshot(rider()).rides[0].pickupPin; act(driver, 'start', {pin}); };
  return {store, rider, driver, riderToken, driverToken, invite, create, act, start, get ride(){return ride;}, advance: ms => {now += ms;}, key: randomUUID};
}
const rejects = (work, status) => assert.throws(work, error => error.status === status);

test('normal fare needs driver agreement; fare and payment are locked until the correct stages', () => {
  const f = setup(); f.create({amount:1}); assert.equal(f.ride.offer.amount, 900);
  rejects(() => f.act(f.rider, 'accept', {offerId:f.ride.offer.id}),409);
  rejects(() => f.act(f.rider, 'paid'),409);
  rejects(() => f.act(f.driver, 'complete'),409);
  f.act(f.driver,'accept',{offerId:f.ride.offer.id}); assert.equal(f.ride.agreedFare,900);
  rejects(() => f.act(f.driver,'offer',{amount:1000}),409);
  rejects(() => f.act(f.rider,'en_route'),403);
});
test('both sides chat and counteroffer; only the opposite party accepts the latest offer', () => {
  const f=setup();f.create({fareMode:'negotiate',amount:500});
  f.act(f.rider,'message',{text:'Meet at the entrance'}); f.act(f.driver,'message',{text:'I see you'});
  assert.equal(f.ride.messages.length,2);
  const previous=f.ride.offer.id; f.act(f.driver,'offer',{amount:750});
  rejects(()=>f.act(f.rider,'accept',{offerId:previous}),409);
  rejects(()=>f.act(f.driver,'accept',{offerId:f.ride.offer.id}),409);
  f.act(f.rider,'accept',{offerId:f.ride.offer.id});assert.equal(f.ride.agreedFare,750);
});
test('pickup code is rider-only; wrong codes throttle; stage changes cannot be skipped', () => {
  const f=setup(); f.create(); f.act(f.driver,'accept',{offerId:f.ride.offer.id}); f.act(f.driver,'en_route');
  rejects(()=>f.act(f.driver,'start',{pin:'1234'}),409); f.act(f.driver,'arrive');
  const riderView=f.store.snapshot(f.rider()).rides[0], driverView=f.store.snapshot(f.driver()).rides[0];
  assert.match(riderView.pickupPin,/^\d{4}$/); assert.equal(driverView.pickupPin,undefined); assert.equal(driverView.pin,undefined);
  for(let i=0;i<5;i++) rejects(()=>f.act(f.driver,'start',{pin:'0000'}),400);
  rejects(()=>f.act(f.driver,'start',{pin:riderView.pickupPin}),429);
  f.advance(60001);f.act(f.driver,'start',{pin:riderView.pickupPin});assert.equal(f.ride.status,'in_progress');
});
test('complete → rider payment report → driver confirmation; rider cannot mark a trip paid early', () => {
  const f=setup();f.start(); rejects(()=>f.act(f.rider,'paid'),409); rejects(()=>f.act(f.rider,'cancel',{reason:'Changed my mind'}),409);
  f.act(f.driver,'complete');assert.equal(f.ride.paymentStatus,'due');
  rejects(()=>f.act(f.driver,'received'),409); f.act(f.rider,'paid');assert.equal(f.ride.paymentStatus,'reported');
  f.act(f.driver,'not_received');assert.equal(f.ride.paymentStatus,'due');
  f.act(f.rider,'paid');f.act(f.driver,'received');assert.equal(f.ride.status,'settled');
});
test('a reported problem pauses settlement and only its reporter can clear it', () => {
  const f=setup();f.start();f.act(f.driver,'complete');f.act(f.rider,'issue',{reason:'We did not reach the destination'});
  rejects(()=>f.act(f.rider,'paid'),409);rejects(()=>f.act(f.driver,'resolve'),403);
  f.act(f.rider,'resolve'); f.act(f.rider,'paid'); f.act(f.driver,'received');assert.equal(f.ride.status,'settled');
});
test('driver may waive a completed fare but cannot waive before the trip is completed', () => {
  const f=setup();f.start();rejects(()=>f.act(f.driver,'waive'),409);f.act(f.driver,'complete');f.act(f.driver,'waive');assert.equal(f.ride.paymentStatus,'waived');assert.equal(f.ride.status,'settled');
});
test('no-show cancellation before pickup is free; cancelled rides cannot restart', () => {
  const f=setup();f.create();f.act(f.driver,'accept',{offerId:f.ride.offer.id});f.act(f.driver,'en_route');
  f.act(f.rider,'cancel',{reason:'Driver did not arrive'});assert.equal(f.ride.status,'cancelled');assert.equal(f.ride.paymentStatus,'not_due');
  rejects(()=>f.act(f.driver,'arrive'),409);f.create();assert.equal(f.ride.status,'requested');
});
test('unaccepted requests expire and release both participants', () => {
  const f=setup();f.create();f.advance(600001);assert.equal(f.store.snapshot(f.rider()).rides[0].status,'expired');
  f.driver();f.create();assert.equal(f.ride.status,'requested');
});
test('duplicate requests and actions are idempotent, including start-trip retries', () => {
  const f=setup();const key=randomUUID();const first=f.create({},key);const retry=f.create({},key);assert.equal(first.id,retry.id);assert.equal(f.store.data.rides.length,1);
  rejects(()=>f.create({destination:'Kacyiru'},key),409);
  f.act(f.driver,'accept',{offerId:f.ride.offer.id});f.act(f.driver,'en_route');f.act(f.driver,'arrive');
  const input={action:'start',version:f.ride.version,pin:f.store.snapshot(f.rider()).rides[0].pickupPin};const startKey=randomUUID();
  const started=f.store.act(f.driver(),f.ride.id,input,startKey).ride;
  const retried=f.store.act(f.driver(),f.ride.id,input,startKey).ride;assert.equal(started.version,retried.version);
});
test('a stale acceptance or command cannot overwrite changes from the other phone', () => {
  const f=setup();f.create();const version=f.ride.version;f.act(f.driver,'offer',{amount:800});
  rejects(()=>f.store.act(f.rider(),f.ride.id,{action:'accept',version,offerId:f.ride.offer.id},randomUUID()),409);
});
test('a rider and driver can have only one open ride; another rider cannot double-book', () => {
  const f=setup();f.create();rejects(()=>f.create(),409);
  const other=f.store.actor(f.store.rider().token);
  rejects(()=>f.store.create(other,{vehicleId:'mv-201',pickup:'Kacyiru',destination:'Remera',fareMode:'normal',paymentMethod:'Cash'},randomUUID()),409);
  rejects(()=>f.store.release(f.driver()),409);
});
test('private rides and messages cannot be read or changed by another rider or driver', () => {
  const f=setup();f.create();const stranger=f.store.actor(f.store.rider().token);assert.equal(f.store.snapshot(stranger).rides.length,0);
  rejects(()=>f.store.act(stranger,f.ride.id,{action:'message',text:'Intrusion',version:f.ride.version},randomUUID()),404);
  const invite=f.store.invite(stranger,'mv-202');const other=f.store.actor(f.store.redeem(invite.code).token);assert.equal(f.store.snapshot(other).rides.length,0);
  rejects(()=>f.store.act(other,f.ride.id,{action:'cancel',reason:'Intrusion',version:f.ride.version},randomUUID()),404);
});
test('invites expire, can be redeemed once, and cannot replace a paired driver', () => {
  const f=setup();rejects(()=>f.store.redeem(f.invite.code),410);rejects(()=>f.store.invite(f.rider(),'mv-201'),409);
  const invite=f.store.invite(f.rider(),'mv-202');f.advance(600001);rejects(()=>f.store.redeem(invite.code),410);
});
test('interrupted driver enrollment can be retried only by the same device key', () => {
  const f=setup(); const invite=f.store.invite(f.rider(),'mv-202');const key=randomBytes(32).toString('hex');
  const first=f.store.redeem(invite.code,key), second=f.store.redeem(invite.code,key);assert.equal(first.token,second.token);
  rejects(()=>f.store.redeem(invite.code,randomBytes(32).toString('hex')),410);
  assert.equal(f.store.data.sessions.filter(s=>s.vehicleId==='mv-202').length,1);
});
test('releasing and re-pairing a plate does not expose the previous driver’s chats', () => {
  const f=setup();f.create();f.act(f.rider,'message',{text:'Private old trip'});f.act(f.rider,'cancel',{reason:'Test finished'});
  f.store.release(f.driver());rejects(()=>f.store.actor(f.driverToken),401);
  const invite=f.store.invite(f.rider(),'mv-201');const replacement=f.store.actor(f.store.redeem(invite.code).token);assert.equal(f.store.snapshot(replacement).rides.length,0);
});
test('offline drivers cannot receive new bookings', () => {
  const f=setup();f.advance(16000);rejects(()=>f.create(),409);f.driver();f.create();assert.equal(f.ride.status,'requested');
});
test('server rejects malformed fare, route, text and payment inputs', () => {
  for(const override of [{fareMode:'negotiate',amount:0},{fareMode:'negotiate',amount:1.5},{fareMode:'negotiate',amount:Infinity},{fareMode:'unknown'},{pickup:'   '},{destination:'kigali CITY centre'},{paymentMethod:'Card'}]) {
    const f=setup();rejects(()=>f.create(override),400);assert.equal(f.store.data.rides.length,0);
  }
});
test('restarting the store preserves sessions, trip, chat and receipt', () => {
  const dir=mkdtempSync(join(tmpdir(),'mova-store-'));
  try {
    const file=join(dir,'rides.json'), f=setup(file);f.start();f.act(f.rider,'message',{text:'Saved message'});f.act(f.driver,'complete');f.act(f.rider,'paid');f.act(f.driver,'received');
    const restarted=new RideStore(file);const snapshot=restarted.snapshot(restarted.actor(f.riderToken));assert.equal(snapshot.rides[0].paymentStatus,'confirmed');assert.equal(snapshot.rides[0].messages[0].text,'Saved message');
    const fresh=new RideStore(file);assert.equal(fresh.snapshot(fresh.actor(f.driverToken)).rides[0].status,'settled');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('driver plate selection is repeatable, rejects takeover, and blocks switching during an active ride', () => {
  const f=setup(), key=randomBytes(32).toString('hex');
  const session=f.store.selectDriver('mv-202',key);assert.equal(session.vehicleId,'mv-202');assert.equal(f.store.selectDriver('mv-202',key).token,key);
  rejects(()=>f.store.selectDriver('mv-202',randomBytes(32).toString('hex')),409);
  rejects(()=>f.store.selectDriver('unknown',key),400);
  f.create();rejects(()=>f.store.selectDriver('mv-203',f.driverToken),409);
  f.act(f.rider,'cancel',{reason:'Switch plates'});assert.equal(f.store.selectDriver('mv-203',f.driverToken).vehicleId,'mv-203');
});
test('simulation starts in Ntunga, advances by server time, and is identical for both participants', () => {
  const f=setup();f.create({pickupCoords:ASYV});f.act(f.driver,'accept',{offerId:f.ride.offer.id});f.act(f.driver,'en_route',{durationMs:30000});
  let r=f.store.snapshot(f.rider()).rides[0];assert.equal(r.tracking.progress,0);assert.deepEqual(r.tracking.position,vehicleOrigin('mv-201'));
  f.advance(15000);r=f.store.snapshot(f.rider()).rides[0];const d=f.store.snapshot(f.driver()).rides[0];assert.equal(r.tracking.progress,.5);assert.deepEqual(r.tracking,d.tracking);
  f.advance(20000);r=f.store.snapshot(f.rider()).rides[0];assert.equal(r.tracking.progress,1);assert.deepEqual(r.tracking.position,ASYV);assert.equal(r.status,'en_route');assert.equal(r.paymentStatus,'not_due');
});
test('pause, resume and cancellation freeze the shared simulated approach', () => {
  const f=setup();f.create();f.act(f.driver,'accept',{offerId:f.ride.offer.id});f.act(f.driver,'en_route',{durationMs:30000});f.advance(6000);
  rejects(()=>f.act(f.rider,'pause_simulation'),403);f.act(f.driver,'pause_simulation');
  const progress=f.ride.tracking.progress;f.advance(9000);assert.equal(f.store.snapshot(f.rider()).rides[0].tracking.progress,progress);
  f.act(f.driver,'resume_simulation');f.advance(3000);assert.ok(f.store.snapshot(f.rider()).rides[0].tracking.progress>progress);
  f.act(f.rider,'cancel',{reason:'No longer needed'});const stopped=f.ride.tracking.progress;f.advance(60000);assert.equal(f.store.snapshot(f.rider()).rides[0].tracking.progress,stopped);
});
test('Google path is validated, shared, and interpolated by distance rather than point count', () => {
  const f=setup();f.create();f.act(f.driver,'accept',{offerId:f.ride.offer.id});
  rejects(()=>f.act(f.driver,'en_route',{route:{source:'google',path:[{lat:0,lng:0},ASYV]}}),400);
  rejects(()=>f.act(f.driver,'en_route',{durationMs:1}),400);
  const middle={lat:NTUNGA.lat+(ASYV.lat-NTUNGA.lat)*.1,lng:NTUNGA.lng+(ASYV.lng-NTUNGA.lng)*.1};
  f.act(f.driver,'en_route',{durationMs:30000,route:{source:'google',path:[NTUNGA,middle,ASYV]}});f.advance(15000);
  const r=f.store.snapshot(f.rider()).rides[0];assert.equal(r.tracking.source,'google');assert.ok(distanceKm(r.tracking.position,middle)>1);assert.equal(r.tracking.path.length,3);
});
test('invalid GPS coordinates cannot create a ride', () => {
  const f=setup();rejects(()=>f.create({pickupCoords:{lat:NaN,lng:30}}),400);rejects(()=>f.create({pickupCoords:{lat:-200,lng:30}}),400);assert.equal(f.store.data.rides.length,0);
});
test('Ntunga has distinct bike parking pins and the default approach lasts exactly 15 seconds', () => {
  const bikes=SEEDS.filter(v=>v.type === 'Moto');assert.ok(bikes.length>=12);
  assert.equal(new Set(bikes.map(v=>JSON.stringify(vehicleOrigin(v)))).size,bikes.length);
  for(const bike of bikes)assert.ok(distanceKm(vehicleOrigin(bike),NTUNGA)<.5);
  const f=setup();f.create();f.act(f.driver,'accept',{offerId:f.ride.offer.id});f.act(f.driver,'en_route');
  assert.equal(f.ride.tracking.durationMs,15000);f.advance(14999);assert.ok(f.store.snapshot(f.rider()).rides[0].tracking.progress<1);
  f.advance(1);assert.equal(f.store.snapshot(f.rider()).rides[0].tracking.progress,1);assert.equal(f.store.snapshot(f.rider()).rides[0].paymentStatus,'not_due');
});
