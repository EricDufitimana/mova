import React from 'react';
import { ArrowRight, Route } from 'lucide-react';
import { rideLabels } from './rideService.js';
import { money } from './data.js';
export default function RideHistory({service, onOpen}) {
  return <section><div className="modal-kicker">YOUR ACTIVITY</div><h2>My rides.</h2><p className="modal-description">Requests, conversations and receipts are saved on this server for this rider device.</p>
    {!service.connected && <p className="booking-error">{service.error || 'Connecting…'}</p>}
    {!service.state.rides.length && <div className="history-empty"><Route size={28}/><strong>No requests yet.</strong><p>Connect a driver phone, choose its plate, and request a ride.</p></div>}
    <div className="live-history">{service.state.rides.map(ride => <button key={ride.id} onClick={() => onOpen(ride.id)}><div><strong>{ride.plate} / {ride.driver}</strong><span>{ride.pickup} → {ride.destination}</span><small>{rideLabels[ride.status]}</small></div><div><strong>{money(ride.agreedFare || ride.offer.amount)}</strong><ArrowRight size={17}/></div></button>)}</div>
  </section>;
}
