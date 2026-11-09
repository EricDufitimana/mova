import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, MapPin, MessageCircle, Wallet } from 'lucide-react';
import { money } from './data.js';

const PLACES = ['Kigali city centre', 'Nyabugogo bus park', 'Kimironko market', 'Kigali Convention Centre', 'Kigali Heights', 'Remera', 'Kacyiru', 'Kigali International Airport', 'Kigali Arena', 'Gikondo'];
const normalize = value => value.trim().replace(/\s+/g, ' ').toLowerCase();

export default function RideBooking({ vehicle, onComplete, onHistory }) {
  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState(PLACES[0]);
  const [destination, setDestination] = useState('');
  const [fareMode, setFareMode] = useState('normal');
  const [offer, setOffer] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [agreedFare, setAgreedFare] = useState(null);
  const [counter, setCounter] = useState(null);
  const [payment, setPayment] = useState('MTN MoMo');
  const [error, setError] = useState('');
  const total = fareMode === 'normal' ? vehicle.price : agreedFare;
  const routeValid = pickup.trim().length >= 3 && destination.trim().length >= 3 && normalize(pickup) !== normalize(destination);

  const changePlace = (setter, value) => {
    setter(value); setAgreedFare(null); setCounter(null); setMessages([]); setError('');
  };
  const propose = event => {
    event.preventDefault();
    const amount = Number(offer);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000) {
      setError('Enter a whole amount from 1 to 1,000,000 RWF.'); return;
    }
    // Local, deterministic driver simulation; no message is sent to a real driver.
    const minimum = Math.ceil(vehicle.price * 0.8 / 50) * 50;
    const accepted = amount >= minimum;
    setMessages(old => [...old,
      { who: 'You', text: `Can we do ${money(amount)}?${message.trim() ? ` ${message.trim()}` : ''}` },
      { who: `${vehicle.driver} (demo)`, text: accepted ? `Yes, we can do ${money(amount)}. See you at ${pickup.trim()}!` : `For ${destination.trim()}, I can do ${money(minimum)}. Does that work for you?` }
    ]);
    setAgreedFare(accepted ? amount : null); setCounter(accepted ? null : minimum); setMessage(''); setError('');
  };
  const confirm = () => {
    if (!routeValid || !Number.isSafeInteger(total) || total <= 0) { setStep(0); setError('Choose your trip and agree a fare first.'); return; }
    onComplete({ pickup: pickup.trim(), destination: destination.trim(), price: total, listedPrice: vehicle.price, fareMode, payment });
    setStep(3);
  };

  if (step === 3) return <div className="success-content">
    <div className="success-symbol"><Check size={34}/></div><div className="modal-kicker">DEMO BOOKING COMPLETE</div>
    <h2>Your ride is ready.</h2><p>{pickup.trim()} → {destination.trim()}</p>
    <div className="success-summary"><span>{fareMode === 'normal' ? 'Normal fare' : 'Negotiated fare'}</span><strong>{money(total)}</strong></div>
    <p>Saved in My rides. This is a demo: no driver was contacted and no payment was made.</p>
    <button className="modal-main-button" onClick={onHistory}>View my rides <ArrowRight size={17}/></button>
  </div>;

  return <>
    <div className="modal-step"><span>BOOK YOUR RIDE</span><span>STEP {step + 1} OF 3</span></div>
    <h2>{['Where are you going?', 'Your ride, your choice.', 'Choose how to pay.'][step]}</h2>
    <p className="modal-description">{['Choose a Kigali landmark or type your own pickup and destination.', 'Take the normal fare or talk through a price with your driver.', 'Review your trip and fare before confirming your demo booking.'][step]}</p>
    <div className="checkout-ride"><MapPin size={22}/><div><strong>{vehicle.driver}</strong><span>{vehicle.model} / {vehicle.plate}</span></div><div className="checkout-amount">{money(total ?? vehicle.price)}</div></div>

    {step === 0 && <form onSubmit={event => { event.preventDefault(); if (!routeValid) { setError('Enter different pickup and destination places (at least 3 characters each).'); return; } setError(''); setStep(1); }}>
      <datalist id="kigali-booking-places">{PLACES.map(place => <option key={place} value={place}/>)}</datalist>
      <label className="booking-field">Pickup place<input list="kigali-booking-places" value={pickup} onChange={event => changePlace(setPickup, event.target.value)} placeholder="Where should the driver meet you?" required minLength={3} maxLength={120}/></label>
      <label className="booking-field">Destination<input list="kigali-booking-places" value={destination} onChange={event => changePlace(setDestination, event.target.value)} placeholder="Where are you going?" required minLength={3} maxLength={120}/></label>
      <p className="tiny-disclaimer">Places are entered for this demo. Addresses and routes are not verified.</p>
      {error && <p className="booking-error" role="alert">{error}</p>}
      <button className="modal-main-button" type="submit">Choose your fare <ArrowRight size={17}/></button>
    </form>}

    {step === 1 && <>
      <div className="trip-summary"><MapPin size={16}/><span>{pickup.trim()} <ArrowRight size={12}/> {destination.trim()}</span></div>
      <div className="fare-options" role="group" aria-label="Fare choice">
        <button aria-pressed={fareMode === 'normal'} className={fareMode === 'normal' ? 'fare-choice chosen-fare' : 'fare-choice'} onClick={() => { setFareMode('normal'); setError(''); }}><Wallet size={20}/><strong>Normal price</strong><span>{money(vehicle.price)}</span></button>
        <button aria-pressed={fareMode === 'negotiate'} className={fareMode === 'negotiate' ? 'fare-choice chosen-fare' : 'fare-choice'} onClick={() => { setFareMode('negotiate'); setError(''); }}><MessageCircle size={20}/><strong>Negotiate with driver</strong><span>Propose your own fare</span></button>
      </div>
      {fareMode === 'negotiate' && <div className="negotiation-panel">
        <div className="negotiation-heading"><MessageCircle size={16}/><strong>Talk to {vehicle.driver.split(' ')[0]}</strong><span>DEMO CHAT</span></div>
        <p className="tiny-disclaimer">Driver replies are simulated. Make an offer, accept a counteroffer, or try another amount.</p>
        <div className="fare-chat" role="log" aria-label="Fare conversation" aria-live="polite">{messages.map((entry, index) => <div key={index} className={entry.who === 'You' ? 'chat-bubble chat-you' : 'chat-bubble'}><strong>{entry.who}</strong><p>{entry.text}</p></div>)}</div>
        <form onSubmit={propose}>
          <label className="booking-field">Your offer (RWF)<input type="number" inputMode="numeric" min="1" max="1000000" step="1" value={offer} onChange={event => { setOffer(event.target.value); setAgreedFare(null); setCounter(null); setError(''); }} placeholder={`e.g. ${Math.ceil(vehicle.price * 0.8 / 50) * 50}`} required/></label>
          <label className="booking-field">Message to driver (optional)<input value={message} onChange={event => setMessage(event.target.value)} placeholder="Can you meet me by the entrance?" maxLength={240}/></label>
          <button className="modal-secondary-button" type="submit">Send demo offer <MessageCircle size={14}/></button>
        </form>
        {counter !== null && <button className="modal-secondary-button" onClick={() => { setAgreedFare(counter); setMessages(old => [...old, {who: 'You', text: `Agreed, ${money(counter)}. Thank you!`}]); setCounter(null); }}>Accept {money(counter)} counteroffer <Check size={15}/></button>}
        {agreedFare !== null && <p className="fare-agreed" role="status"><Check size={15}/> Fare agreed: {money(agreedFare)}</p>}
      </div>}
      <p className="tiny-disclaimer">The normal price is a sample fare for this prototype, not a metered or distance-based quote.</p>
      {error && <p className="booking-error" role="alert">{error}</p>}
      <button className="modal-main-button" disabled={total === null} onClick={() => setStep(2)}>Continue with {total === null ? 'an agreed fare' : money(total)} <ArrowRight size={17}/></button>
      <button className="back-link" onClick={() => setStep(0)}><ArrowLeft size={15}/> Change places</button>
    </>}

    {step === 2 && <>
      <div className="checkout-lines"><div><span>Pickup</span><strong>{pickup.trim()}</strong></div><div><span>Destination</span><strong>{destination.trim()}</strong></div><div><span>{fareMode === 'normal' ? 'Normal fare' : 'Negotiated fare'}</span><strong>{money(total)}</strong></div></div>
      <div className="payment-options">{['Cash', 'MTN MoMo', 'Airtel Money', 'Card (demo)'].map(option => <button key={option} aria-pressed={payment === option} className={payment === option ? 'payment-choice selected-payment' : 'payment-choice'} onClick={() => setPayment(option)}><Wallet size={18}/><strong>{option}</strong><span className="payment-radio">{payment === option && <Check size={12}/>}</span></button>)}</div>
      <p className="tiny-disclaimer">Demo only. No charge, payment request, or driver dispatch.</p>
      <button className="modal-main-button" onClick={confirm}>Confirm demo booking <ArrowRight size={17}/></button>
      <button className="back-link" onClick={() => setStep(1)}><ArrowLeft size={15}/> Back to fare choice</button>
    </>}
  </>;
}
