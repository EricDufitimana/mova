import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, MessageCircle, ShieldCheck, MapPin } from 'lucide-react';
import { money } from './data.js';
import { closedRide, rideLabels } from './rideService.js';
import ApproachMap from './ApproachMap.jsx';

export default function RideRoom({ ride, service }) {
  const driver = service.state.role === 'driver';
  const role = driver ? 'driver' : 'rider';
  const [draft, setDraft] = useState('');
  const [offer, setOffer] = useState('');
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [panel, setPanel] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const log = useRef(null);
  const root = useRef(null);
  const previousStatus = useRef(ride.status);
  useEffect(() => {
    if (previousStatus.current !== ride.status) {
      const modal = root.current?.closest('.modal-card');
      if (modal) modal.scrollTop = 0;
      previousStatus.current = ride.status;
    }
  }, [ride.status]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [ride.messages.length, ride.events.length]);
  const act = async (action, extra = {}) => {
    if (pending) return;
    setPending(true); setError('');
    try { await service.mutate(`/rides/${ride.id}/action`, {action, version: ride.version, ...extra}); setConfirmation(null); setPanel(''); return true; }
    catch (failure) { setError(failure.message); return false; }
    finally { setPending(false); }
  };
  const disabled = pending || !service.connected;
  const terminal = closedRide(ride);
  const entries = [...ride.events.map(e => ({...e, system: true})), ...ride.messages].sort((a, b) => a.at - b.at);
  const progress = ['requested', 'confirmed', 'en_route', 'arrived', 'in_progress', 'completed', 'settled'];

  return <section ref={root} className="ride-room" aria-label={`Ride ${ride.plate}`}>
    <div className="modal-kicker">{driver ? 'DRIVER WORKSPACE' : 'YOUR RIDE'} / {ride.plate}</div>
    <h2>{rideLabels[ride.status]}</h2>
    <div className={`connection-status ${service.connected ? '' : 'connection-off'}`} role="status"><i/>{service.connected ? 'Connected · updates every few seconds' : 'Reconnecting · actions paused'}<span>#{ride.id.slice(0, 8)}</span></div>
    <ol className="ride-progress" aria-label="Trip progress">{['Agreed', 'Pickup', 'Riding', 'Complete'].map((label, i) => <li key={label} className={progress.indexOf(ride.status) >= [1, 3, 4, 5][i] ? 'done' : ''}><span>{i + 1}</span>{label}</li>)}</ol>
    <div className="ride-room-layout"><div className="ride-map-column"><ApproachMap ride={ride} service={service} onAction={act} disabled={disabled}/></div><div className="ride-controls-column">
    <div className="ride-route"><MapPin size={18}/><div><strong>{ride.pickup}</strong><ArrowRight size={14}/><strong>{ride.destination}</strong><small>{ride.driver} · {ride.plate}</small></div></div>
    <div className="fare-lock"><div><span>{ride.agreedFare ? 'Locked fare' : 'Latest offer'}</span><strong>{money(ride.agreedFare || ride.offer.amount)}</strong></div><div><span>{ride.paymentMethod}</span><strong>{ride.paymentStatus === 'waived' ? 'Fare waived' : ride.paymentStatus === 'confirmed' ? 'Receipt confirmed' : ride.paymentStatus === 'reported' ? 'Awaiting receipt confirmation' : ride.status === 'completed' ? 'Due after trip' : terminal ? 'Nothing charged' : 'Nothing due yet'}</strong></div></div>
    <p className="tiny-disclaimer"><ShieldCheck size={14}/> No deposit or automatic charge. Cash/MoMo happens outside this demo, after completion. The app only records both sides’ acknowledgement.</p>
    {ride.status === 'requested' && <div className="ride-action-block">
      <p>{ride.offer.by === role ? 'Your offer is waiting for the other person.' : `${driver ? 'Rider' : 'Driver'} proposes ${money(ride.offer.amount)}. You can accept or counter.`}</p>
      <small>Expires {new Date(ride.expiresAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} if no fare is agreed.</small>
      {ride.offer.by !== role && <button className="modal-main-button" disabled={disabled} onClick={() => act('accept', {offerId: ride.offer.id})}>Accept {money(ride.offer.amount)} <Check size={16}/></button>}
      <form className="inline-form" onSubmit={async e => { e.preventDefault(); if (await act('offer', {amount: Number(offer)})) setOffer(''); }}>
        <label className="booking-field">{driver ? 'Counteroffer (RWF)' : 'New offer (RWF)'}<input type="number" inputMode="numeric" min="1" max="1000000" step="1" value={offer} onChange={e => setOffer(e.target.value)} required placeholder="Enter an amount"/></label>
        <button className="modal-secondary-button" disabled={disabled}>Send offer</button>
      </form>
    </div>}
    {!driver && ['confirmed', 'en_route', 'arrived'].includes(ride.status) && <div className="pickup-code"><ShieldCheck size={24}/><div><span>Your pickup code</span><strong>{ride.pickupPin}</strong><p>Check the plate and driver in person. Share this code only when you are ready to start.</p></div></div>}
    {driver && ride.status === 'en_route' && <button className="modal-main-button" disabled={disabled} onClick={() => act('arrive')}>I have arrived at pickup <MapPin size={16}/></button>}
    {driver && ride.status === 'arrived' && <form onSubmit={e => { e.preventDefault(); act('start', {pin}); }}><label className="booking-field">Rider pickup code<input inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} value={pin} onChange={e => setPin(e.target.value)} required autoComplete="off" placeholder="Ask the rider in person"/></label><button className="modal-main-button" disabled={disabled}>Verify code & start trip <ShieldCheck size={16}/></button></form>}
    {!driver && ride.status === 'confirmed' && <p className="ride-hint">Fare agreed. Waiting for the driver to set off. You can still cancel without a charge.</p>}
    {!driver && ride.status === 'en_route' && <p className="ride-hint">Watch the simulated driver travel from Ntunga to your pickup above. Movement is shared across devices.</p>}
    {driver && ride.status === 'in_progress' && <button className="modal-main-button" disabled={disabled} onClick={() => setConfirmation({action:'complete', label:'Confirm trip completed', text:'Confirm you have reached the destination or agreed to end the trip. This makes the locked fare due.'})}>End trip at destination <Check size={16}/></button>}
    {ride.issue && <div className="issue-banner" role="status"><strong>Issue open · payment acknowledgement paused</strong><p>{ride.issue.reason}</p><small>Reported by {ride.issue.by}. Discuss below; this demo has no staffed support.</small>{ride.issue.by === role && <button className="modal-secondary-button" disabled={disabled} onClick={() => act('resolve')}>I confirm this issue is resolved</button>}</div>}
    {ride.status === 'completed' && <div className="ride-action-block">
      {!driver && ride.paymentStatus === 'due' && <><p>Pay {money(ride.agreedFare)} by {ride.paymentMethod} only after the trip. Confirm the recipient with your driver.</p><button className="modal-main-button" disabled={disabled || !!ride.issue} onClick={() => setConfirmation({action:'paid', label:'Confirm I have paid', text:`Only confirm after you have actually handed over cash or sent ${money(ride.agreedFare)}. This button does not transfer money.`})}>I have paid after the ride <Check size={16}/></button></>}
      {!driver && ride.paymentStatus === 'reported' && <p>Payment reported. Waiting for the driver to confirm receipt. Do not pay a second time while you discuss a disagreement.</p>}
      {driver && ride.paymentStatus === 'reported' && <><p>The rider reports payment. Check your cash or wallet before confirming.</p><button className="modal-main-button" disabled={disabled || !!ride.issue} onClick={() => setConfirmation({action:'received', label:'Confirm payment received', text:'Confirm you received the full agreed amount. This closes the ride.'})}>Confirm receipt <Check size={16}/></button><button className="modal-secondary-button" disabled={disabled} onClick={() => act('not_received')}>I have not received payment</button></>}
      {driver && ride.paymentStatus === 'due' && <p>Payment is due after completion. Wait for the rider to pay, then confirm receipt here.</p>}
      {driver && <button className="back-link" disabled={disabled} onClick={() => setConfirmation({action:'waive', label:'Waive fare and close ride', text:'This permanently closes the ride with nothing payable. Use this only if you agree to waive the fare.'})}>Waive fare / resolve without payment</button>}
    </div>}
    {confirmation && <div className="action-confirm" role="group" aria-label="Confirm ride action"><p>{confirmation.text}</p><button className="modal-main-button" disabled={disabled} onClick={() => act(confirmation.action)}>{confirmation.label}</button><button className="back-link" disabled={pending} onClick={() => setConfirmation(null)}>Go back</button></div>}
    {terminal && <p className="fare-agreed"><Check size={16}/>{ride.status === 'settled' ? 'Ride closed. Your trip and receipt are saved.' : `${ride.cancelReason || 'No agreement before expiry'}. No payment is due.`}</p>}
    {error && <p className="booking-error" role="alert">{error}</p>}
    {!service.connected && <p className="booking-error" role="alert">{service.error} Messages are not sent while disconnected. Your draft stays here.</p>}
    <div className="live-chat"><div className="negotiation-heading"><MessageCircle size={18}/><strong>Rider & driver chat</strong><span>REAL MESSAGES</span></div>
      <div className="fare-chat" role="log" aria-label="Ride conversation" aria-live="polite" ref={log}>{entries.map(entry => entry.system ? <p className="chat-event" key={entry.id}>{entry.text}</p> : <div className={`chat-bubble ${entry.who === role ? 'chat-you' : ''}`} key={entry.id}><strong>{entry.who === role ? 'You' : entry.who === 'driver' ? ride.driver : 'Rider'} <time>{new Date(entry.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></strong><p>{entry.text}</p></div>)}</div>
      {!terminal && <form onSubmit={async e => { e.preventDefault(); if (await act('message', {text:draft})) setDraft(''); }}><label className="booking-field">Message<input value={draft} maxLength={500} required onChange={e => setDraft(e.target.value)} placeholder="Pickup details, questions, or an offer..."/></label><button className="modal-secondary-button" disabled={disabled || !draft.trim()}>Send message <ArrowRight size={14}/></button></form>}
    </div>
    {!terminal && <div className="ride-help"><button className="back-link" disabled={disabled} onClick={() => {setPanel(panel === 'issue' ? '' : 'issue'); setReason('');}}>Report a problem</button>{['requested','confirmed','en_route','arrived'].includes(ride.status) && <button className="back-link danger-link" disabled={disabled} onClick={() => {setPanel(panel === 'cancel' ? '' : 'cancel'); setReason('');}}>Cancel / no-show · no charge</button>}</div>}
    {panel && <form className="issue-banner" onSubmit={e => {e.preventDefault(); act(panel, {reason});}}><label className="booking-field">{panel === 'cancel' ? 'Cancellation reason' : 'Describe the problem'}<input value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={200} required placeholder={panel === 'cancel' ? 'Driver did not arrive, changed plans...' : 'Explain what happened...'}/></label><p className="tiny-disclaimer">{panel === 'cancel' ? 'This closes the request with no charge to either side.' : 'This pauses payment acknowledgement. Use chat to resolve it; no support agent or emergency service is notified.'}</p><button className="modal-secondary-button" disabled={disabled}>{panel === 'cancel' ? 'Confirm cancellation without charge' : 'Record problem'}</button></form>}
    </div></div>
  </section>;
}
