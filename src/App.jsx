import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bike, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, CreditCard, ExternalLink, Filter, Heart,
  Info, Layers2, LocateFixed, MapPin, Menu, Minus, Navigation2, Phone,
  Plus, Route, Search, ShieldCheck, SlidersHorizontal, Star, Wallet, X,
  CarFront, CarTaxiFront, History, Crosshair, Maximize2, Minimize2
} from 'lucide-react';
import { KIGALI, SEEDS, near, distanceKm, money } from './data.js';
import { OpenStreetMap, GoogleMapView } from './Maps.jsx';
import IllustratedMap from './IllustratedMap.jsx';
import RideBooking from './RideBooking.jsx';

const FILTERS = ['All rides', 'Moto', 'Car', 'Taxi'];
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const typeIcon = { Moto: Bike, Car: CarFront, Taxi: CarTaxiFront };
const formatDistance = n => n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;

function TypeIcon({ type, size = 20 }) {
  const Icon = typeIcon[type] || CarFront;
  return <Icon size={size} strokeWidth={1.8} />;
}
function Brand() {
  return <div className="brand"><div className="brand-symbol"><span></span><span></span></div><div className="brand-name">mova<span>.</span></div></div>;
}
function DriverAvatar({ vehicle, size = 'normal' }) {
  return <div className={`driver-avatar ${size === 'large' ? 'driver-avatar-large' : ''}`} style={{'--avatar-color': vehicle.color}}>
    {vehicle.driver.split(' ').slice(0, 2).map(x => x[0]).join('')}
  </div>;
}
function VehicleRow({ v, active, onClick, favorite, onFavorite, user }) {
  return <div className={`vehicle-row ${active ? 'active' : ''} ${v.status === 'Busy' ? 'is-busy' : ''}`}>
    <button className="vehicle-row-main" onClick={onClick} aria-label={`View ${v.plate} details`}>
      <div className="vehicle-illustration"><TypeIcon type={v.type} size={24} /></div>
      <div className="vehicle-row-info">
        <div className="vehicle-heading">{v.type} <span className="vehicle-divider">/</span> {v.model}</div>
        <div className="vehicle-plate">{v.plate}</div>
        <div className="vehicle-row-meta"><Star size={12} fill="currentColor" strokeWidth={0} /> {v.rating.toFixed(1)} <span>·</span> {formatDistance(distanceKm(user, v))} away</div>
      </div>
      <div className="vehicle-right"><strong>{money(v.price).replace(' RWF', '')}</strong><span>RWF / trip</span><i className={v.status === 'Available' ? 'availability-dot' : 'availability-dot off'}></i><small>{v.status === 'Available' ? `${v.eta} min` : 'Busy'}</small></div>
    </button>
    <button className={`favorite-tap ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={favorite ? 'Remove saved vehicle' : 'Save vehicle'} title={favorite ? 'Unsave' : 'Save'}><Heart size={15} fill={favorite ? 'currentColor' : 'none'} /></button>
  </div>;
}
function Modal({ children, onClose, wide = false }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
    <div className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
      <button className="modal-dismiss icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>{children}
    </div>
  </div>;
}
function DemoLabel() { return <span className="demo-label"><span className="demo-dot" /> INTERACTIVE PROTOTYPE</span>; }

export default function App() {
  const user = KIGALI;
  const anchor = KIGALI;
  const accuracy = 80;
  const [tileStatus, setTileStatus] = useState('loading');
  const [locationTick, setLocationTick] = useState(0);
  const [filter, setFilter] = useState('All rides');
  const [sort, setSort] = useState('nearest');
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem('mova-favorites') || '[]'); } catch { return []; } });
  const [selectedId, setSelectedId] = useState('mv-201');
  const [theme, setTheme] = useState('dark');
  const [provider, setProvider] = useState('live');
  const [fullscreen, setFullscreen] = useState(false);
  const [mapApi, setMapApi] = useState(null);
  const [modal, setModal] = useState(null);
  const [bookingVehicle, setBookingVehicle] = useState(null);
  const [booked, setBooked] = useState(() => { try { return JSON.parse(localStorage.getItem('mova-bookings') || '[]'); } catch { return []; } });
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);

  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); }, []);
  useEffect(() => { document.body.classList.toggle('mova-fullscreen-active', fullscreen); return () => document.body.classList.remove('mova-fullscreen-active'); }, [fullscreen]);
  useEffect(() => { if (!fullscreen) return; const onKey = e => { if (e.key === 'Escape') setFullscreen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [fullscreen]);
  useEffect(() => { if (mapApi) { const t = setTimeout(() => mapApi.invalidateSize(), 120); return () => clearTimeout(t); } }, [fullscreen, mapApi]);
  useEffect(() => { localStorage.setItem('mova-favorites', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('mova-bookings', JSON.stringify(booked)); }, [booked]);

  const locate = () => setLocationTick(n => n + 1);
  const vehicles = useMemo(() => SEEDS.map(v => ({ ...v, ...near(anchor, v.dx, v.dy) })), [anchor]);
  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = vehicles.filter(v =>
      (filter === 'All rides' || v.type === filter) &&
      (!onlyAvailable || v.status === 'Available') &&
      (!savedOnly || favorites.includes(v.id)) &&
      (!term || [v.driver, v.plate, v.type, v.model].some(x => x.toLowerCase().includes(term)))
    );
    return list.sort((a, b) => sort === 'price' ? a.price - b.price : sort === 'rating' ? b.rating - a.rating : distanceKm(user, a) - distanceKm(user, b));
  }, [vehicles, filter, search, sort, user, onlyAvailable, savedOnly, favorites]);
  const selected = displayed.find(v => v.id === selectedId) || null;
  const activeCount = displayed.filter(v => v.status === 'Available').length;
  const onMapReady = useCallback(map => setMapApi(map), []);
  const chooseVehicle = useCallback(id => setSelectedId(id), []);
  const toggleFavorite = (id) => setFavorites(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  const googleDirections = (v = selected) => {
    if (!v) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${user.lat},${user.lng}&destination=${v.lat},${v.lng}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const openBook = () => {
    if (!selected || selected.status !== 'Available') return;
    setBookingVehicle(selected); setModal('book');
  };
  const completeBooking = details => {
    if (!bookingVehicle) return;
    const ride = { ...details, id: crypto.randomUUID(), plate: bookingVehicle.plate, driver: bookingVehicle.driver, type: bookingVehicle.type, date: new Date().toISOString() };
    setBooked(prev => [ride, ...prev]);
  };
  return <div className={`app-shell ${fullscreen ? 'app-fullscreen' : ''}`}>
    <header className="topbar">
      <div className="topbar-brand"><Brand /><span className="brand-caption">MOVE THROUGH YOUR CITY</span></div>
      <nav className={`main-nav ${mobileMenu ? 'mobile-open' : ''}`} aria-label="Main navigation">
        <button className="nav-link current" onClick={() => { setModal(null); setSavedOnly(false); setMobileMenu(false); }}>Explore <span className="nav-current-dot" /></button>
        <button className="nav-link" onClick={() => { setModal('history'); setMobileMenu(false); }}>My rides {booked.length > 0 && <span className="nav-counter">{booked.length}</span>}</button>
        <button className={`nav-link ${savedOnly ? 'current' : ''}`} onClick={() => { setSavedOnly(v => !v); setMobileMenu(false); }}>Saved</button>
        <button className="nav-link" onClick={() => { setModal('about'); setMobileMenu(false); }}>How it works</button>
      </nav>
      <div className="header-actions"><button className="fullscreen-button" onClick={() => setFullscreen(v => !v)} title={fullscreen ? "Exit fullscreen (Esc)" : "Expand to fullscreen"} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</span></button><span className="header-location"><MapPin size={14} /> Kigali, Rwanda</span><span className="header-divider" /><button className="profile-badge" onClick={() => setModal('about')} aria-label="About Mova">M</button><button className="mobile-menu-btn icon-button" onClick={() => setMobileMenu(v => !v)} aria-label="Menu"><Menu size={20} /></button></div>
    </header>

    <main className="workspace">
      <section className="hero-intro">
        <div className="hero-copy"><div className="hero-eyebrow"><span className="eyebrow-line" /> THE SMARTER WAY TO MOVE <span className="slash-separator">/</span> KIGALI DEMO</div>
          <h1>There's a ride <em>around you.</em></h1>
          <p>Explore nearby drivers, compare prices, and find your way — all from one map.</p></div>
        <div className="hero-side"><DemoLabel /><div className="mini-stats"><div><span>AVAILABLE NEARBY</span><strong>{vehicles.filter(v => v.status === 'Available').length.toString().padStart(2,'0')}<small> rides</small></strong></div><span className="stat-line" /><div><span>STARTING FROM</span><strong>900<small> RWF</small></strong></div></div></div>
      </section>

      <section className="explorer" aria-label="Interactive vehicle finder">
        <aside className="vehicle-sidebar">
          <div className="sidebar-head"><div><span className="eyebrow-muted">01 / DISCOVER</span><h2>Explore rides <span className="sidebar-count">{displayed.length}</span></h2></div><button className={`compact-icon-btn ${onlyAvailable ? 'active-filter' : ''}`} onClick={() => setOnlyAvailable(v => !v)} title="Toggle available only" aria-label="Show available vehicles only"><SlidersHorizontal size={18} /></button></div>
          <label className="search-field"><Search size={17} /><input placeholder="Search plate, driver, vehicle..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Search vehicles" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</label>
          <div className="type-filters">{FILTERS.map(item => <button key={item} className={filter === item ? 'filter-chip chosen' : 'filter-chip'} onClick={() => setFilter(item)}>{item}</button>)}</div>
          <div className="sidebar-subcontrols"><div className="available-indicator"><span className="pulse-dot" /> {activeCount} available {savedOnly && '· Saved'}</div><label className="sort-label">Sort <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort rides"><option value="nearest">Nearest</option><option value="price">Lowest price</option><option value="rating">Top rated</option></select><ChevronDown size={12} /></label></div>
          <div className="vehicle-list" role="list" aria-label="Nearby vehicles">{displayed.length ? displayed.map(v => <VehicleRow key={v.id} v={v} user={user} active={selected?.id === v.id} onClick={() => chooseVehicle(v.id)} favorite={favorites.includes(v.id)} onFavorite={() => toggleFavorite(v.id)} />) : <div className="empty-list"><Search size={24} /><strong>No rides match</strong><span>Try another filter or search term.</span><button onClick={() => {setSearch('');setFilter('All rides');setOnlyAvailable(false);setSavedOnly(false);}}>Clear filters</button></div>}</div>
          <div className="sidebar-bottom"><ShieldCheck size={16} /><div><strong>A smoother way to get around.</strong><span>Ride details are illustrative. No real drivers are tracked.</span></div><ArrowUpRight size={17} /></div>
        </aside>

        <div className="map-panel">
          <div className="map-bg-shimmer" />
          <div className="map-canvas" aria-label="Map of vehicles near you">
            {provider === 'live'
              ? <OpenStreetMap center={user} vehicles={displayed} selected={selected} onSelect={chooseVehicle} theme={theme} locationTick={locationTick} onMapReady={onMapReady} accuracy={accuracy} onTileStatus={setTileStatus} />
              : provider === 'google' ? <GoogleMapView apiKey={GOOGLE_API_KEY} center={user} vehicles={displayed} selected={selected} onSelect={chooseVehicle} locationTick={locationTick} />
              : <IllustratedMap vehicles={displayed} selected={selected} onSelect={chooseVehicle} />}
          </div>
          <div className="map-topbar"><div className="map-heading"><span className="map-geo-icon"><Navigation2 size={15} fill="currentColor" /></span><div><strong>Kigali, Rwanda</strong><span>Demo pickup / Kigali city centre</span></div></div>
            <div className="map-provider"><button className={provider === 'live' ? 'provider-active' : ''} onClick={() => setProvider('live')}>Kigali map</button><button className={provider === 'illustrated' ? 'provider-active' : ''} onClick={() => setProvider('illustrated')}>Offline demo</button>{GOOGLE_API_KEY && <button className={provider === 'google' ? 'provider-active' : ''} onClick={() => setProvider('google')}>Google Maps <ArrowUpRight size={12} /></button>}</div></div>
          <div className="map-counter"><div className="radar-pip" /><span>{activeCount} active vehicles</span><span className="map-counter-sep" /><span>Simulated positions</span></div>
          <div className="location-notice" role="status"><Info size={14}/><span>{provider === 'illustrated' ? 'Illustrative Kigali demo / interactive sample rides.' : provider === 'google' ? 'Kigali demo / simulated drivers and fares.' : tileStatus === 'ready' ? 'Kigali demo / no API key needed.' : tileStatus === 'offline' ? 'Street tiles unavailable / interactive Kigali illustration shown.' : 'Kigali demo ready / loading street details...'}</span><button onClick={locate}>Recenter <ArrowRight size={13}/></button></div>
          {provider === 'live' && <div className="map-tools"><button onClick={() => mapApi?.zoomIn()} aria-label="Zoom in" title="Zoom in"><Plus size={19}/></button><button onClick={() => mapApi?.zoomOut()} aria-label="Zoom out" title="Zoom out"><Minus size={19}/></button><span className="map-tools-rule"/><button onClick={locate} aria-label="Recenter Kigali demo" title="Recenter Kigali demo"><LocateFixed size={19}/></button><button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label="Switch map style" title="Switch map style"><Layers2 size={19}/></button></div>}
          <div className="map-bottom-legend"><div><i className="legend-dot me" /> Demo pickup</div><div><i className="legend-dot free" /> Available</div><div><i className="legend-dot busy" /> Busy</div></div>
          {selected && <div className="driver-details">
            <div className="detail-topline"><span>SELECTED RIDE <span className="detail-slash">/</span> {selected.id.toUpperCase()}</span><button className="detail-close" onClick={() => setSelectedId(null)} aria-label="Close vehicle details"><X size={16}/></button></div>
            <div className="detail-driver"><DriverAvatar vehicle={selected} size="large" /><div className="detail-name"><h3>{selected.driver}</h3><div><Star size={13} fill="currentColor" /> {selected.rating.toFixed(1)} <span>·</span> {selected.trips.toLocaleString()} trips</div></div><span className={`detail-status ${selected.status === 'Busy' ? 'status-busy' : ''}`}><span />{selected.status}</span></div>
            <div className="detail-vehicle"><div className="detail-type-symbol"><TypeIcon type={selected.type} size={20} /></div><div><strong>{selected.model}</strong><span>{selected.plate} · {selected.type}</span></div><div className="detail-fare"><strong>{money(selected.price)}</strong><span>Indicative fare</span></div></div>
            <div className="detail-specs"><div><Clock3 size={15}/><strong>{selected.eta} min</strong><span>est. arrival</span></div><div><Route size={15}/><strong>{formatDistance(distanceKm(user, selected))}</strong><span>straight-line</span></div><button onClick={() => googleDirections()}><Navigation2 size={15}/><strong>Directions</strong><span>Google Maps <ArrowUpRight size={10}/></span></button></div>
            <div className="detail-buttons"><button className="secondary-action" onClick={() => setModal('call')}><Phone size={16}/> Call</button><button className="primary-action" onClick={openBook} disabled={selected.status !== 'Available'}>{selected.status === 'Available' ? 'Book this ride' : 'Driver unavailable'} <ArrowUpRight size={17}/></button></div>
          </div>}
          {!selected && <div className="select-tip"><Crosshair size={16} /> Select a marker or ride to see details.</div>}
        </div>
      </section>
      <footer className="app-footer"><span>© 2026 MOVA LAB <span className="footer-dot">·</span> MADE FOR THE CITY</span><span>Kigali demo. Simulated drivers. No payments processed. <button onClick={() => setModal('about')}>About this prototype <ArrowUpRight size={12}/></button></span></footer>
    </main>

    {modal === 'call' && selected && <Modal onClose={() => setModal(null)}><div className="modal-emblem"><Phone size={22}/></div><div className="modal-kicker">CONNECT TO DRIVER</div><h2>Call {selected.driver.split(' ')[0]}.</h2><p className="modal-description">You selected <strong>{selected.plate}</strong>, a {selected.model}. In a production version, this button would initiate an in-app or phone call to a verified driver.</p><div className="demo-notice"><Info size={17}/><span>Prototype only — no real phone numbers or calls are connected.</span></div><button className="modal-main-button" onClick={() => setModal(null)}>Got it <Check size={17}/></button></Modal>}
    {modal === 'book' && bookingVehicle && <Modal onClose={() => setModal(null)}><RideBooking vehicle={bookingVehicle} onComplete={completeBooking} onHistory={() => setModal('history')}/></Modal>}
    {modal === 'history' && <Modal onClose={() => setModal(null)} wide><div className="modal-kicker">YOUR ACTIVITY</div><h2>My rides<span className="orange-period">.</span></h2><p className="modal-description">All bookings below are simulated and stored only in this browser.</p>{booked.length === 0 ? <div className="history-empty"><History size={29}/><strong>No trips yet.</strong><p>Once you book a demo vehicle, your reservation appears here.</p><button onClick={() => setModal(null)}>Explore rides <ArrowRight size={15}/></button></div> : <div className="bookings-list">{booked.map(b => <div className="booking-entry" key={b.id}><div className="booking-icon"><CheckCircle2 size={20}/></div><div><strong>{b.type} · {b.plate}</strong><span>{b.driver} · {new Date(b.date).toLocaleDateString()} · {b.payment}</span><span>{b.pickup && b.destination ? `${b.pickup} → ${b.destination}` : 'Kigali demo'}</span><span>{b.fareMode === 'negotiate' ? 'Negotiated fare' : 'Normal fare'}</span><small>{b.id} · Demo confirmed</small></div><strong>{money(b.price)}</strong></div>)}</div>}<button className="modal-secondary-button" onClick={() => setModal(null)}>Back to map</button></Modal>}
    {modal === 'about' && <Modal onClose={() => setModal(null)} wide><div className="modal-kicker">HOW MOVA WORKS</div><h2>Find. Choose. Move<span className="orange-period">.</span></h2><p className="modal-description">Mova is a high-fidelity transport discovery concept designed for an effortless rider experience.</p><div className="how-grid"><div><div className="how-step">01</div><MapPin size={23}/><h3>Explore the map</h3><p>Explore sample vehicles around a fixed demo pickup in Kigali. No location permission or Google API key is needed.</p></div><div><div className="how-step">02</div><Filter size={23}/><h3>Choose a ride</h3><p>Filter by ride type, compare sample prices, check plates, and view driver details.</p></div><div><div className="how-step">03</div><Wallet size={23}/><h3>Reserve in seconds</h3><p>Try the booking and simulated payment flow. Nothing is charged or dispatched.</p></div></div><div className="demo-notice"><Info size={17}/><span>This prototype starts in Kigali with an interactive bundled illustration; genuine street tiles appear when available. Vehicle positions, driver identities, plate numbers, fares, calls and payments are entirely fictional. A live service requires a backend, driver opt-in, verification, and payment integrations.</span></div><button className="modal-main-button" onClick={() => setModal(null)}>Start exploring <ArrowRight size={17}/></button></Modal>}
    {toast && <div className="toast-pop"><Info size={15}/>{toast}<button aria-label="Dismiss" onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>;
}
