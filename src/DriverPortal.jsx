import React, { useEffect, useState } from 'react';
import { Bike, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { SEEDS, ASYV, NTUNGA } from './data.js';
import GeoMap from './GeoMap.jsx';
import { api, useRideService, rideLabels, requestId } from './rideService.js';
import RideRoom from './RideRoom.jsx';

export default function DriverPortal() {
  const service = useRideService('driver');
  const [code] = useState(() => window.location.hash.startsWith('#driver=') ? window.location.hash.slice(8) : '');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState(null);
  const [release, setRelease] = useState(false);
  const [plate, setPlate] = useState(SEEDS[0].id);
  useEffect(()=>{if(service.state.vehicleId)setPlate(service.state.vehicleId);},[service.state.vehicleId]);
  const vehicle = SEEDS.find(v => v.id === service.state.vehicleId);
  const ride = service.active || service.state.rides.find(r => r.id === selected);
  const claim = async () => {
    setPending(true); setError('');
    try {
      let deviceToken=service.token || localStorage.getItem('mova-driver-join-key');
      if (!deviceToken) {deviceToken=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('mova-driver-join-key',deviceToken);}
      const session=await api('/driver/select',{body:{vehicleId:plate,deviceToken},id:requestId()});
      service.saveToken(session.token);setSelected(null);await service.refresh();
    } catch(failure) {setError(failure.message);} finally {setPending(false);}
  };
  const join = async () => {
    setPending(true); setError('');
    try {
      let deviceToken = localStorage.getItem('mova-driver-join-key');
      if (!deviceToken) {
        deviceToken = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('');
        localStorage.setItem('mova-driver-join-key', deviceToken);
      }
      const session = await api('/driver/redeem', {body:{code, deviceToken}, id:requestId()});
      service.saveToken(session.token); localStorage.removeItem('mova-driver-join-key'); window.history.replaceState(null, '', '/#driver');
    }
    catch (failure) {setError(failure.message);}
    finally {setPending(false);}
  };
  const leave = async () => {
    setPending(true); setError('');
    try {await service.mutate('/driver/release', {}); localStorage.removeItem('mova-driver-session'); localStorage.removeItem('mova-driver-join-key'); window.location.href = '/#driver'; window.location.reload();}
    catch (failure) {setError(failure.message);}
    finally {setPending(false);}
  };
  const picker = <div className="driver-plate-picker"><label className="booking-field">Choose your driver plate<select value={plate} onChange={e=>setPlate(e.target.value)} disabled={!!service.active}>{SEEDS.map(v=><option key={v.id} value={v.id}>{v.plate} / {v.type} / {v.driver}</option>)}</select></label><button className="modal-main-button" disabled={pending || !!service.active} onClick={claim}>{pending ? 'Connecting…' : service.token ? 'Use selected plate' : 'Go online with this plate'}</button></div>;
  return <div className="driver-shell"><header className="driver-header"><a href="#customer" className="driver-brand">mova<span>.</span><small>DRIVER</small></a><a href="#customer"><ArrowLeft size={14}/> Customer view</a></header>
    <main className="driver-main">
      {!service.token ? <section className="driver-card"><div className="modal-emblem"><Bike size={26}/></div><div className="modal-kicker">DRIVER / NTUNGA</div><h1>Choose your plate.</h1><p className="modal-description">Your simulated driver starts in Ntunga. The customer selects the same plate on their device. Once a fare is agreed, start the shared approach to their pickup.</p>{picker}{code && <button className="modal-secondary-button" disabled={pending} onClick={join}>Join invited demo plate</button>}<GeoMap pickup={ASYV} driver={NTUNGA} fitKey="driver-ntunga"/></section> : <>
        <div className="driver-welcome"><div><span className="modal-kicker">YOUR PLATE</span><h1>{vehicle?.plate || 'Connecting…'}</h1><p>{vehicle?.driver} / {vehicle?.model}</p></div><span className={`driver-online ${service.connected ? '' : 'offline'}`}><i/>{service.connected ? 'Online' : 'Reconnecting'}</span></div>
        <p className="tiny-disclaimer">Driver origin: Ntunga. Movement is simulated and shared with the customer; the customer can use real GPS for pickup. No payment provider is connected.</p>
        {!service.active && picker}
        {service.error && <p className="booking-error" role="alert">{service.error}<button className="back-link" onClick={service.refresh}><RefreshCw size={14}/> Retry connection</button></p>}
        {ride ? <div className="driver-card"><RideRoom key={ride.id} ride={ride} service={service}/>{!service.active && <button className="back-link" onClick={() => setSelected(null)}>Return to waiting screen</button>}</div> : <section className="driver-card driver-waiting"><div className="waiting-radar"><Bike size={34}/></div><h2>Waiting for a rider.</h2><p>Ask the other person to select <strong>{vehicle?.plate}</strong> in the rider view and send a request. Keep this screen open to stay online.</p><p>No auto replies. You decide whether to accept, counteroffer, or decline.</p></section>}
        {service.state.rides.length > 0 && <section className="driver-history"><h2>Recent rides</h2>{service.state.rides.map(r => <button key={r.id} onClick={() => setSelected(r.id)}><strong>{r.pickup} → {r.destination}</strong><span>{rideLabels[r.status]}</span></button>)}</section>}
        {!service.active && <><GeoMap pickup={ASYV} driver={NTUNGA} fitKey="idle-ntunga"/><button className="back-link danger-link" onClick={() => setRelease(!release)}>Release this plate from this phone</button></>}
        {release && <div className="issue-banner"><p>This signs out the driver and allows a new invitation for this plate. Keep this device if you want to retain access to its history.</p><button className="modal-secondary-button" disabled={pending} onClick={leave}>Confirm release plate</button></div>}
      </>}
      {error && <p className="booking-error" role="alert">{error}</p>}
    </main>
  </div>;
}
