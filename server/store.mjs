import { randomBytes, randomInt, createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEEDS, ASYV, NTUNGA, vehicleOrigin, distanceKm } from '../src/data.js';
import { trackingAt } from '../src/tracking.js';

export const CLOSED = new Set(['cancelled', 'expired', 'settled']);
const PRETRIP = new Set(['requested', 'confirmed', 'en_route', 'arrived']);
const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
export class RideError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (condition, status, message) => { if (!condition) throw new RideError(status, message); };
function text(value, min, max) {
  fail(typeof value === 'string', 400, 'Text is required.');
  const result = value.trim().replace(/\s+/g, ' ');
  fail(result.length >= min && result.length <= max, 400, `Use ${min}–${max} characters.`);
  return result;
}
function amount(value) {
  fail(Number.isSafeInteger(value) && value > 0 && value <= 1000000, 400, 'Fare must be a whole amount from 1 to 1,000,000 RWF.');
  return value;
}
function coordinates(point) {
  fail(point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180, 400, 'Choose a valid pickup location.');
  return {lat:point.lat, lng:point.lng};
}

/** Single-process local demo store. Mutations are synchronous, atomic and durable. */
export class RideStore {
  constructor(file, now = () => Date.now()) {
    this.file = file; this.now = now; this.seen = new Map();
    this.data = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { schema: 1, sessions: [], invites: [], rides: [], receipts: [] };
    fail(this.data.schema === 1 && Array.isArray(this.data.rides), 500, 'Unsupported ride database.');
  }
  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
  transaction(work) {
    const before = structuredClone(this.data);
    try { const result = work(); this.save(); return result; }
    catch (error) { this.data = before; throw error; }
  }
  actor(token) {
    fail(typeof token === 'string' && token.length === 64, 401, 'Session missing. Reconnect this device.');
    const actor = this.data.sessions.find(session => session.key === hash(token) && !session.revoked);
    fail(actor, 401, 'This session is no longer active.');
    this.seen.set(actor.id, this.now());
    return actor;
  }
  createSession(role = 'rider', vehicleId = null, token = secret()) {
    const session = { id: randomUUID(), key: hash(token), role, vehicleId, createdAt: this.now() };
    this.data.sessions.push(session);
    this.seen.set(session.id, this.now());
    return { token, role, vehicleId };
  }
  rider() { return this.transaction(() => this.createSession()); }
  selectDriver(vehicleId, deviceToken) {
    fail(SEEDS.some(v => v.id === vehicleId), 400, 'Choose a known plate.');
    fail(typeof deviceToken === 'string' && /^[a-f0-9]{64}$/.test(deviceToken), 400, 'Invalid driver device key.');
    this.expire();
    return this.transaction(() => {
      const existing = this.data.sessions.find(s => s.key === hash(deviceToken) && !s.revoked);
      fail(!existing || existing.role === 'driver', 403, 'This key belongs to a customer.');
      fail(!this.data.sessions.some(s => s.role === 'driver' && s.vehicleId === vehicleId && !s.revoked && s.id !== existing?.id), 409, 'This plate is already selected on another driver device. Release it there or choose another plate.');
      if (existing) {
        fail(existing.vehicleId === vehicleId || !this.data.rides.some(r => r.driverId === existing.id && !CLOSED.has(r.status)), 409, 'Finish or cancel your ride before changing plates.');
        existing.vehicleId = vehicleId; this.seen.set(existing.id, this.now());
        return {token:deviceToken, role:'driver', vehicleId};
      }
      return this.createSession('driver', vehicleId, deviceToken);
    });
  }
  expire() {
    let changed = false;
    for (const ride of this.data.rides) if (ride.status === 'requested' && ride.expiresAt <= this.now()) {
      ride.status = 'expired'; ride.version++; changed = true;
      this.event(ride, 'system', 'Request expired without an agreement. No payment is due.');
    }
    if (changed) this.save();
  }
  invite(actor, vehicleId) {
    fail(actor.role === 'rider', 403, 'Only a rider can connect a driver phone.');
    fail(SEEDS.some(vehicle => vehicle.id === vehicleId), 400, 'Unknown plate.');
    fail(!this.data.sessions.some(s => s.role === 'driver' && s.vehicleId === vehicleId && !s.revoked), 409, 'This plate already has a driver device. Use that device, or release its plate first.');
    return this.transaction(() => {
      const code = secret();
      this.data.invites = this.data.invites.filter(i => i.expiresAt > this.now() && !i.used && i.vehicleId !== vehicleId);
      this.data.invites.push({ key: hash(code), vehicleId, expiresAt: this.now() + 600000 });
      return { code, vehicleId, expiresAt: this.now() + 600000 };
    });
  }
  redeem(code, deviceToken) {
    fail(typeof code === 'string' && code.length === 64, 400, 'Invalid driver invitation.');
    if (deviceToken !== undefined) fail(typeof deviceToken === 'string' && /^[a-f0-9]{64}$/.test(deviceToken), 400, 'Invalid driver device key.');
    return this.transaction(() => {
      const invite = this.data.invites.find(i => i.key === hash(code));
      if (invite?.used && deviceToken) {
        const session = this.data.sessions.find(s => s.id === invite.sessionId && s.key === hash(deviceToken) && !s.revoked);
        if (session) return {token:deviceToken, role:'driver', vehicleId:invite.vehicleId};
      }
      fail(invite && !invite.used && invite.expiresAt > this.now(), 410, 'Invitation used or expired. Ask the rider for a new link.');
      fail(!this.data.sessions.some(s => s.role === 'driver' && s.vehicleId === invite.vehicleId && !s.revoked), 409, 'This plate already has a connected driver.');
      invite.used = true;
      const session = this.createSession('driver', invite.vehicleId, deviceToken);
      invite.sessionId = this.data.sessions[this.data.sessions.length - 1].id;
      return session;
    });
  }
  release(actor) {
    fail(actor.role === 'driver', 403, 'Only a driver can release a plate.');
    this.expire();
    fail(!this.data.rides.some(r => r.vehicleId === actor.vehicleId && !CLOSED.has(r.status)), 409, 'Finish or cancel the active ride before releasing the plate.');
    return this.transaction(() => { actor.revoked = true; return { released: true }; });
  }
  event(ride, who, message) {
    ride.events.push({ id: randomUUID(), who, text: message, at: this.now() });
  }
  visible(ride, actor) {
    const result = structuredClone(ride);
    result.tracking = ride.pickupCoords ? trackingAt(ride, this.now()) : null;
    delete result.simulation;
    delete result.riderId; delete result.driverId; delete result.pin; delete result.pinFailures; delete result.pinLockedUntil;
    if (actor.role === 'rider' && !CLOSED.has(ride.status)) result.pickupPin = ride.pin;
    return result;
  }
  owns(ride, actor) {
    return actor.role === 'rider' ? ride.riderId === actor.id : ride.driverId === actor.id;
  }
  snapshot(actor) {
    this.expire();
    return {
      role: actor.role, vehicleId: actor.vehicleId, serverTime: this.now(),
      rides: this.data.rides.filter(r => this.owns(r, actor)).slice().reverse().map(r => this.visible(r, actor)),
      vehicles: SEEDS.map(v => ({ id: v.id,
        position: vehicleOrigin(v),
        connected: this.data.sessions.some(s => s.role === 'driver' && s.vehicleId === v.id && !s.revoked),
        online: this.data.sessions.some(s => s.role === 'driver' && s.vehicleId === v.id && !s.revoked && (this.seen.get(s.id) || 0) > this.now() - 15000),
        busy: this.data.rides.some(r => r.vehicleId === v.id && !CLOSED.has(r.status))
      }))
    };
  }
  command(actor, requestId, body, work) {
    fail(typeof requestId === 'string' && /^[\w-]{8,100}$/.test(requestId), 400, 'A request ID is required.');
    const fingerprint = hash(JSON.stringify(body));
    const receipt = this.data.receipts.find(r => r.actor === actor.id && r.requestId === requestId);
    if (receipt) {
      fail(receipt.fingerprint === fingerprint, 409, 'This request ID was already used for a different action.');
      return { ride: this.visible(this.data.rides.find(r => r.id === receipt.rideId), actor) };
    }
    this.expire();
    return this.transaction(() => {
      const ride = work();
      this.data.receipts.push({ actor: actor.id, requestId, fingerprint, rideId: ride.id });
      return { ride: this.visible(ride, actor) };
    });
  }
  create(actor, input, requestId) {
    return this.command(actor, requestId, { operation: 'create', ...input }, () => {
      fail(actor.role === 'rider', 403, 'Only riders can request rides.');
      const vehicle = SEEDS.find(v => v.id === input.vehicleId);
      fail(vehicle, 400, 'Unknown vehicle.');
      fail(this.data.sessions.some(s => s.role === 'driver' && s.vehicleId === vehicle.id && !s.revoked && (this.seen.get(s.id) || 0) > this.now() - 15000), 409, 'The driver is offline. Connect their phone or wait until they return.');
      fail(!this.data.rides.some(r => !CLOSED.has(r.status) && (r.riderId === actor.id || r.vehicleId === vehicle.id)), 409, 'You or this driver already have an active ride. Open My rides to continue or cancel.');
      const pickup = text(input.pickup, 3, 120), destination = text(input.destination, 3, 120);
      fail(pickup.toLowerCase() !== destination.toLowerCase(), 400, 'Choose different pickup and destination places.');
      fail(['normal', 'negotiate'].includes(input.fareMode), 400, 'Choose a fare option.');
      fail(['Cash', 'MTN MoMo', 'Airtel Money'].includes(input.paymentMethod), 400, 'Choose a payment method for after the ride.');
      const fare = input.fareMode === 'normal' ? vehicle.price : amount(input.amount);
      const driverSession = this.data.sessions.find(s => s.role === 'driver' && s.vehicleId === vehicle.id && !s.revoked);
      const ride = { id: randomUUID(), riderId: actor.id, driverId: driverSession.id, vehicleId: vehicle.id, plate: vehicle.plate, driver: vehicle.driver,
        pickup, destination, driverOrigin:vehicleOrigin(vehicle), pickupCoords: coordinates(input.pickupCoords || ASYV), fareMode: input.fareMode, listedPrice: vehicle.price, agreedFare: null,
        paymentMethod: input.paymentMethod, paymentStatus: 'not_due', status: 'requested', version: 1,
        offer: { id: randomUUID(), amount: fare, by: 'rider' }, pin: String(randomInt(1000, 10000)), pinFailures: 0,
        createdAt: this.now(), expiresAt: this.now() + 600000, messages: [], events: [], issue: null };
      this.event(ride, 'rider', `Requested ${pickup} → ${destination}. Offered ${fare} RWF. Pay after the trip.`);
      this.data.rides.push(ride);
      return ride;
    });
  }
  act(actor, id, input, requestId) {
    if (this.data.receipts.some(r => r.actor === actor.id && r.requestId === requestId)) {
      return this.command(actor, requestId, { rideId: id, ...input }, () => {});
    }
    // Persist PIN throttling even when the attempted command is rejected.
    if (input.action === 'start') {
      const ride = this.data.rides.find(r => r.id === id);
      fail(ride && this.owns(ride, actor), 404, 'Ride not found.');
      fail(actor.role === 'driver' && ride.status === 'arrived', 409, 'Only the assigned driver can start after arriving.');
      fail(ride.version === input.version, 409, 'This ride changed. Refresh and check the latest status.');
      fail(!(ride.pinLockedUntil > this.now()), 429, 'Too many incorrect codes. Wait one minute.');
      if (input.pin !== ride.pin) {
        this.transaction(() => { ride.pinFailures++; if (ride.pinFailures % 5 === 0) ride.pinLockedUntil = this.now() + 60000; });
        throw new RideError(400, 'Incorrect pickup code. Ask the rider to check it in their app.');
      }
    }
    return this.command(actor, requestId, { rideId: id, ...input }, () => {
      const ride = this.data.rides.find(r => r.id === id);
      fail(ride && this.owns(ride, actor), 404, 'Ride not found.');
      fail(ride.version === input.version, 409, 'This ride changed on the other phone. Review the latest status and try again.');
      fail(!CLOSED.has(ride.status), 409, 'This ride is closed.');
      const role = actor.role;
      const driver = () => fail(role === 'driver', 403, 'Only the assigned driver can do this.');
      switch (input.action) {
        case 'message':
          fail(ride.messages.length < 200, 409, 'Chat has reached its 200-message limit.');
          ride.messages.push({ id: randomUUID(), who: role, text: text(input.text, 1, 500), at: this.now() });
          break;
        case 'offer':
          fail(ride.status === 'requested', 409, 'The agreed fare is locked.');
          ride.offer = { id: randomUUID(), amount: amount(input.amount), by: role };
          ride.fareMode = 'negotiate';
          this.event(ride, role, `Proposed ${ride.offer.amount} RWF.`);
          break;
        case 'accept':
          fail(ride.status === 'requested' && ride.offer.by !== role && ride.offer.id === input.offerId, 409, 'Only the other person can accept the latest offer.');
          ride.agreedFare = ride.offer.amount; ride.status = 'confirmed';
          this.event(ride, role, `Agreed ${ride.agreedFare} RWF. Fare locked; nothing charged.`);
          break;
        case 'en_route': {
          driver(); fail(ride.status === 'confirmed', 409, 'Agree a fare first.');
          fail(ride.pickupCoords, 409, 'This older request has no mapped pickup. Cancel it and create a new request with a pickup pin.');
          const pickup = ride.pickupCoords || ASYV;
          const origin=ride.driverOrigin || NTUNGA;
          let path = [origin, pickup], source = 'illustrative';
          if (input.route) {
            fail(input.route.source === 'google' && Array.isArray(input.route.path) && input.route.path.length >= 2 && input.route.path.length <= 400, 400, 'Invalid route.');
            path = input.route.path.map(coordinates);
            fail(distanceKm(path[0], origin) < 2 && distanceKm(path[path.length - 1], pickup) < 2, 400, 'Route does not connect Ntunga to this pickup.');
            source = 'google';
          }
          const durationMs = input.durationMs ?? 15000;
          fail(Number.isInteger(durationMs) && durationMs >= 15000 && durationMs <= 600000, 400, 'Choose a simulation duration between 15 seconds and 10 minutes.');
          ride.simulation = {path, source, durationMs, elapsedMs:0, startedAt:this.now(), paused:false};
          ride.status = 'en_route'; this.event(ride, role, 'Simulated driver set off from Ntunga. Movement is shared with the customer.'); break;
        }
        case 'pause_simulation':
          driver(); fail(ride.status === 'en_route' && ride.simulation && !ride.simulation.paused, 409, 'No running approach to pause.');
          ride.simulation.elapsedMs += Math.max(0, this.now() - ride.simulation.startedAt); ride.simulation.paused = true; break;
        case 'resume_simulation':
          driver(); fail(ride.status === 'en_route' && ride.simulation?.paused, 409, 'No paused approach to resume.');
          ride.simulation.startedAt = this.now(); ride.simulation.paused = false; break;
        case 'arrive': driver(); fail(ride.status === 'en_route', 409, 'Mark on the way first.'); ride.status = 'arrived'; this.event(ride, role, 'Arrived at pickup. Check the plate before sharing the code.'); break;
        case 'start': driver(); fail(ride.status === 'arrived', 409, 'Arrive at pickup first.'); ride.status = 'in_progress'; this.event(ride, role, 'Pickup code verified. Trip started.'); break;
        case 'complete': driver(); fail(ride.status === 'in_progress', 409, 'The trip has not started.'); ride.status = 'completed'; ride.paymentStatus = 'due'; this.event(ride, role, 'Trip completed. Payment is now due after the ride.'); break;
        case 'cancel':
          fail(PRETRIP.has(ride.status), 409, 'An active trip cannot be cancelled. Report an issue instead.');
          if (ride.simulation) ride.simulation.stoppedProgress = trackingAt(ride, this.now()).progress;
          ride.status = 'cancelled'; ride.cancelReason = text(input.reason, 3, 200);
          this.event(ride, role, `Cancelled: ${ride.cancelReason}. No charge.`); break;
        case 'issue':
          fail(!ride.issue, 409, 'An issue is already open.');
          ride.issue = { by: role, reason: text(input.reason, 3, 300), at: this.now() };
          this.event(ride, role, `Issue reported: ${ride.issue.reason}. Payment acknowledgement is paused.`); break;
        case 'resolve':
          fail(ride.issue?.by === role, 403, 'Only the person who reported the issue can clear it.');
          ride.issue = null; this.event(ride, role, 'Issue marked resolved by its reporter.'); break;
        case 'paid':
          fail(role === 'rider' && ride.status === 'completed' && ride.paymentStatus === 'due' && !ride.issue, 409, 'Payment can only be recorded after completion with no open issue.');
          ride.paymentStatus = 'reported'; this.event(ride, role, `Rider reports payment by ${ride.paymentMethod}. Waiting for driver confirmation.`); break;
        case 'received':
          driver(); fail(ride.status === 'completed' && ride.paymentStatus === 'reported' && !ride.issue, 409, 'Wait for the rider to report payment and resolve any issue.');
          ride.paymentStatus = 'confirmed'; ride.status = 'settled'; this.event(ride, role, 'Driver confirms payment received. Ride closed.'); break;
        case 'not_received':
          driver(); fail(ride.status === 'completed' && ride.paymentStatus === 'reported', 409, 'No payment report to review.');
          ride.paymentStatus = 'due'; this.event(ride, role, 'Driver has not received payment. Discuss in chat before paying again.'); break;
        case 'waive':
          driver(); fail(ride.status === 'completed', 409, 'Finish the trip first.');
          ride.paymentStatus = 'waived'; ride.status = 'settled'; ride.issue = null; this.event(ride, role, 'Driver waived the fare. Nothing is payable.'); break;
        default: throw new RideError(400, 'Unknown ride action.');
      }
      ride.version++;
      return ride;
    });
  }
}
