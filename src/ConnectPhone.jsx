import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Copy, ArrowUpRight } from 'lucide-react';
import { SEEDS } from './data.js';
import { api } from './rideService.js';

export default function ConnectPhone({ service, vehicleId }) {
  const [plate, setPlate] = useState(vehicleId || SEEDS[0].id);
  const [origins, setOrigins] = useState([window.location.origin]);
  const [origin, setOrigin] = useState(window.location.origin);
  const [invitation, setInvitation] = useState(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const link = invitation ? `${origin}/#driver=${invitation.code}` : '';
  const driver = service.state.vehicles.find(v => v.id === plate);
  useEffect(() => {
    api('/info').then(info => {
      const local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
      const options = [...new Set([...(local ? info.urls : []), window.location.origin])];
      setOrigins(options); setOrigin(options[0]);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    if (!link) { setQr(''); return; }
    QRCode.toDataURL(link, {width:240, margin:2, errorCorrectionLevel:'M'}).then(value => {if (active) setQr(value);}).catch(() => setError('QR could not be generated. Copy the link instead.'));
    return () => {active = false;};
  }, [link]);
  const create = async () => {
    setBusy(true); setError(''); setCopied(false);
    try {setInvitation(await service.mutate('/driver/invite', {vehicleId:plate}));}
    catch (failure) {setError(failure.message);}
    finally {setBusy(false);}
  };
  return <section className="connect-phone">
    <div className="modal-kicker">TWO PHONES / ONE SHARED RIDE</div><h2>Connect a driver phone.</h2>
    <p className="modal-description">Choose the plate, then let your test driver scan the invitation. Keep the rider on this screen or open the app on another phone.</p>
    <label className="booking-field">Driver plate<select value={plate} onChange={e => {setPlate(e.target.value); setInvitation(null);}}>{SEEDS.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.type} · {v.driver}</option>)}</select></label>
    <label className="booking-field">Server address for phones<select value={origin} onChange={e => setOrigin(e.target.value)}>{origins.map(url => <option key={url}>{url}</option>)}</select></label>
    <div className="pay-later-note"><Smartphone size={24}/><div><strong>Use the same Wi-Fi</strong><p>Keep this computer and server running. Phones must reach this address. If Windows asks, allow Node.js on your private network.</p></div></div>
    {driver?.connected ? <p className="fare-agreed">{driver.online ? 'Driver is online' : 'Driver device paired but offline'}. This plate is already paired. Use that driver device; release its plate from its driver screen to pair another.</p> : <button className="modal-main-button" disabled={busy || !service.connected} onClick={create}>{busy ? 'Creating invitation…' : 'Create driver invitation'}<Smartphone size={17}/></button>}
    {link && !driver?.connected && <div className="phone-invitation">
      {qr && <img src={qr} width="240" height="240" alt="Scan this QR code on the driver phone to connect the selected plate"/>}
      <p>One use · expires at {new Date(invitation.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}. Treat this link as a key to the demo plate.</p>
      <label className="booking-field">Driver invitation link<input readOnly value={link} onFocus={e => e.target.select()}/></label>
      <div className="phone-link-actions"><button className="modal-secondary-button" onClick={async () => {try {await navigator.clipboard.writeText(link); setCopied(true);} catch {setError('Select and copy the invitation link above.');}}}><Copy size={14}/>{copied ? 'Copied' : 'Copy link'}</button><a className="modal-secondary-button" href={link} target="_blank" rel="noreferrer">Open driver screen <ArrowUpRight size={14}/></a></div>
    </div>}
    {error && <p className="booking-error" role="alert">{error}</p>}
    <p className="tiny-disclaimer">This grants control of a fictional demo plate, not a verified driver account. The invitation cannot take over a plate already paired to another device. Local HTTP is for private-network testing; use HTTPS and verified accounts before public use.</p>
  </section>;
}
