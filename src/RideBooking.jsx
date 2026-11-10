import React, { useState } from 'react';
import { ArrowRight, MapPin, Wallet, MessageCircle, ShieldCheck } from 'lucide-react';
import { money, ASYV, ASYV_LABEL, NTUNGA } from './data.js';
import { locateAddress } from './googleMaps.js';

const PLACES = [ASYV_LABEL, 'Ntunga', 'Rwamagana', 'Kigali city centre', 'Kimironko market', 'Kigali Heights'];
export default function RideBooking({ vehicle, service, location, onCreated, onConnect }) {
  const [pickup, setPickup] = useState(location?.label || ASYV_LABEL);
  const [destination, setDestination] = useState('');
  const [fareMode, setFareMode] = useState('normal');
  const [offer, setOffer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const driver = service.state.vehicles.find(v => v.id === vehicle.id);
  const submit = async e => {
    e.preventDefault();
    if (pending) return;
    if (pickup.trim().replace(/\s+/g, ' ').toLowerCase() === destination.trim().replace(/\s+/g, ' ').toLowerCase()) {setError('Choose different pickup and destination places.'); return;}
    setPending(true); setError('');
    try {
      if (pickup === 'My current location' && location?.status !== 'live') throw new Error('Wait for GPS access or choose ASYV as your pickup.');
      const pickupCoords=pickup === location?.label ? location.point : pickup === ASYV_LABEL ? ASYV : pickup.toLowerCase() === 'ntunga' ? NTUNGA : await locateAddress(pickup);
      const {ride} = await service.mutate('/rides', {vehicleId:vehicle.id, pickup, pickupCoords, destination, fareMode, amount: Number(offer), paymentMethod});
      onCreated(ride.id);
    } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  };
  return <form onSubmit={submit}>
    <div className="modal-kicker">REQUEST A RIDE / PAY AFTER</div><h2>Where are you going?</h2>
    <p className="modal-description">Choose your places and send a fare to the driver. Your booking is confirmed only when both sides agree.</p>
    <div className="checkout-ride"><MapPin size={22}/><div><strong>{vehicle.driver}</strong><span>{vehicle.model} / {vehicle.plate}</span></div><div className="checkout-amount">{money(vehicle.price)}</div></div>
    <div className={`connection-status ${driver?.online ? '' : 'connection-off'}`}><i/>{driver?.online ? 'Driver online at Ntunga' : 'Driver offline'}<button type="button" onClick={onConnect}>Open Driver tab</button></div>
    <datalist id="kigali-booking-places">{PLACES.map(place => <option key={place} value={place}/>)}</datalist>
    <label className="booking-field">Pickup place<input list="kigali-booking-places" value={pickup} onChange={e => setPickup(e.target.value)} required minLength={3} maxLength={120}/></label>
    <button type="button" className="back-link" onClick={()=>{location?.locate();setPickup('My current location');}}>Use my location for pickup</button>
    {pickup === 'My current location' && location?.status !== 'live' && <p className="booking-error">{location?.error || 'Waiting for GPS permission. For phone GPS, use HTTPS. Choose ASYV instead if unavailable.'}</p>}
    <label className="booking-field">Destination<input list="kigali-booking-places" value={destination} onChange={e => setDestination(e.target.value)} placeholder="Where are you going?" required minLength={3} maxLength={120}/></label>
    <div className="fare-options" role="group" aria-label="Fare choice">
      <button type="button" className={`fare-choice ${fareMode === 'normal' ? 'chosen-fare' : ''}`} aria-pressed={fareMode === 'normal'} onClick={() => setFareMode('normal')}><Wallet size={20}/><strong>Normal price</strong><span>{money(vehicle.price)}</span></button>
      <button type="button" className={`fare-choice ${fareMode === 'negotiate' ? 'chosen-fare' : ''}`} aria-pressed={fareMode === 'negotiate'} onClick={() => setFareMode('negotiate')}><MessageCircle size={20}/><strong>Negotiate with driver</strong><span>Send your own offer</span></button>
    </div>
    {fareMode === 'negotiate' && <label className="booking-field">Your offer (RWF)<input type="number" inputMode="numeric" min="1" max="1000000" step="1" value={offer} onChange={e => setOffer(e.target.value)} required placeholder="Your proposed fare"/></label>}
    <label className="booking-field">Pay after the ride<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>{['Cash','MTN MoMo','Airtel Money'].map(method => <option key={method}>{method}</option>)}</select></label>
    <div className="pay-later-note"><ShieldCheck size={21}/><div><strong>Ride first. Pay afterwards.</strong><p>No deposit, card collection or automatic charge. The driver must arrive and verify your pickup code before starting.</p></div></div>
    <p className="tiny-disclaimer">Demo places and fares are not verified routing quotes. Both people control their own screens; there are no automatic driver replies.</p>
    {error && <p className="booking-error" role="alert">{error}</p>}
    {!service.connected && <p className="booking-error">Connecting to the ride server… {service.error}</p>}
    <button className="modal-main-button" disabled={pending || !service.connected || !driver?.online || driver?.busy}>{pending ? 'Sending request…' : driver?.busy ? 'Driver has an active ride' : 'Send request · nothing to pay'}<ArrowRight size={17}/></button>
  </form>;
}
