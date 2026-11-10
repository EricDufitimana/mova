import React, { useEffect, useRef, useState } from 'react';
import { ASYV, NTUNGA } from './data.js';
import { pointAlong } from './tracking.js';
import { GOOGLE_API_KEY, pickupRoute } from './googleMaps.js';
import GeoMap from './GeoMap.jsx';

export default function ApproachMap({ride, service, onAction, disabled}) {
  const driver = service.state.role === 'driver';
  const pickup = ride.pickupCoords || ASYV;
  const [route, setRoute] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [loading, setLoading] = useState(false);
  const [durationMs, setDurationMs] = useState(15000);
  const [frame, setFrame] = useState(Date.now());
  const receivedAt = useRef(Date.now());
  useEffect(() => {receivedAt.current=Date.now();},[ride.tracking?.progress,ride.tracking?.paused]);
  useEffect(() => {const timer=setInterval(()=>setFrame(Date.now()),200);return()=>clearInterval(timer);},[]);
  useEffect(() => {
    if (!ride.pickupCoords || !driver || !['requested','confirmed'].includes(ride.status) || !GOOGLE_API_KEY) return;
    let active=true;setLoading(true);
    const timer=setTimeout(()=>{if(active){setRouteError('Google routing did not respond. The demo can use a clearly marked illustrative connection.');setLoading(false);}},15000);
    pickupRoute(pickup,ride.driverOrigin || NTUNGA).then(result=>{if(active){setRoute(result);setRouteError('');}}).catch(()=>{if(active)setRouteError('Google driving directions are unavailable. Enable Routes API for this key, or use the illustrative simulation.');}).finally(()=>{clearTimeout(timer);if(active)setLoading(false);});
    return()=>{active=false;clearTimeout(timer);};
  },[driver,pickup.lat,pickup.lng]);
  const tracking = ride.tracking;
  const preview = ['requested','confirmed'].includes(ride.status);
  const path = preview ? route?.path || tracking?.path || [NTUNGA,pickup] : tracking?.path || [NTUNGA,pickup];
  const source = tracking?.source === 'google' ? 'google' : route && ['requested','confirmed'].includes(ride.status) ? 'google' : 'illustrative';
  let progress = tracking?.progress || 0;
  if (ride.status === 'en_route' && !tracking?.paused && service.connected) progress=Math.min(1,progress+Math.max(0,frame-receivedAt.current)/(tracking?.durationMs || 15000));
  const position = pointAlong(path,progress);
  const seconds = Math.ceil((1-progress)*(tracking?.durationMs || durationMs)/1000);
  if (!ride.pickupCoords) return <p className="ride-hint">This earlier booking has no mapped pickup. Its chat and history remain available. To try the Ntunga approach, cancel it before starting and create a new request with a pickup pin.</p>;
  return <section className="approach-panel" aria-label="Shared driver approach simulation">
    <div className="approach-heading"><div><span>NTUNGA → YOUR PICKUP</span><strong>{ride.status === 'en_route' ? progress >= 1 ? 'At the pickup pin' : tracking?.paused ? 'Simulation paused' : 'Driver approaching' : ['arrived','in_progress','completed','settled'].includes(ride.status) ? 'Pickup approach completed' : 'Driver starts at Ntunga'}</strong></div><span className="simulation-pill">SIMULATED</span></div>
    <GeoMap pickup={pickup} driver={position} path={path} source={source} fitKey={`${ride.id}-${source}`}/>
    <div className="approach-metrics"><span>{Math.round(progress*100)}% of approach</span><span>{ride.status === 'en_route' ? `${seconds}s demo time remaining` : 'Both devices see the same movement'}</span></div>
    <progress value={progress} max={1} aria-label="Driver approach progress"/>
    {!service.connected && <p className="booking-error">Connection lost. The marker is held at the last received position; it resyncs when you reconnect.</p>}
    {driver && ride.status === 'confirmed' && <>
      <label className="booking-field">Demo approach duration<select value={durationMs} onChange={e=>setDurationMs(Number(e.target.value))}><option value={15000}>15 seconds · presentation</option><option value={30000}>30 seconds</option><option value={60000}>60 seconds</option></select></label>
      {loading && <p className="tiny-disclaimer">Finding a Google driving route from Ntunga…</p>}
      {routeError && <p className="booking-error">{routeError}</p>}
      <button className="modal-main-button" disabled={disabled || loading} onClick={()=>onAction('en_route',{...(route ? {route:{source:'google',path:route.path}} : {}),durationMs})}>I’m on the way</button>
    </>}
    {driver && ride.status === 'en_route' && progress < 1 && <button className="modal-secondary-button" disabled={disabled} onClick={()=>onAction(tracking?.paused ? 'resume_simulation' : 'pause_simulation')}>{tracking?.paused ? 'Resume approach simulation' : 'Pause approach simulation'}</button>}
    <p className="tiny-disclaimer">Animated demo driver, not the driver phone’s GPS. {source === 'google' ? 'Uses a Google driving route; this is not motorcycle navigation or a live arrival estimate.' : 'Dashed connection is illustrative, not a verified road route.'} Pickup and payment still require manual confirmation.</p>
  </section>;
}
