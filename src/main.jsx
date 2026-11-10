import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App.jsx';
import DriverPortal from './DriverPortal.jsx';

function RoleApp() {
  const [hash,setHash]=useState(window.location.hash);
  useEffect(()=>{const update=()=>setHash(window.location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
  const driver=hash.startsWith('#driver');
  return <><nav className="role-tabs" aria-label="Choose your role"><span>MOVA / RWAMAGANA DEMO</span><div><a href="#customer" aria-current={!driver ? 'page' : undefined}>Customer</a><a href="#driver" aria-current={driver ? 'page' : undefined}>Driver</a></div><small>Same plate. Shared ride.</small></nav>{driver ? <DriverPortal/> : <App/>}</>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><RoleApp/></React.StrictMode>);
