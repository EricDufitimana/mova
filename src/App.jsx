import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bike, ChevronDown, Clock3, Filter, Heart, Info, Layers2, LocateFixed, MapPin, Menu, Minus, Navigation2, Phone, Plus, Route, Search, ShieldCheck, SlidersHorizontal, Star, Wallet, X, CarFront, CarTaxiFront, Crosshair, Maximize2, Minimize2 } from 'lucide-react';
import { NTUNGA, SEEDS, vehicleOrigin, distanceKm, money } from './data.js';
import GeoMap from './GeoMap.jsx';
import useCustomerLocation from './useCustomerLocation.js';
import RideBooking from './RideBooking.jsx';
import RideRoom from './RideRoom.jsx';
import RideHistory from './RideHistory.jsx';
import { useRideService } from './rideService.js';

const FILTERS = ['All rides', 'Moto', 'Car', 'Taxi'];
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
      <div className="vehicle-right"><strong>{money(v.price).replace(' RWF', '')}</strong><span>RWF / trip</span><i className={v.status === 'Available' && v.online ? 'availability-dot' : 'availability-dot off'}></i><small>{v.status === 'Busy' ? 'Busy' : v.online ? 'Online' : 'Offline'}</small></div>
    </button>
    <button className={`favorite-tap ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={favorite ? 'Remove saved vehicle' : 'Save vehicle'} title={favorite ? 'Unsave' : 'Save'}><Heart size={15} fill={favorite ? 'currentColor' : 'none'} /></button>
  </div>;
}
function Modal({ children, onClose, wide = false }) {
  const card = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    card.current?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') {
        const items = [...card.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')].filter(el => el.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (!first) {event.preventDefault(); return;}
        if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) {event.preventDefault(); last.focus();}
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === card.current)) {event.preventDefault(); first.focus();}
      }
    };
    card.current.addEventListener('keydown', key);
    const element = card.current;
    return () => {document.body.style.overflow = overflow; element.removeEventListener('keydown', key); previous?.focus();};
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
    <div ref={card} tabIndex={-1} className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label="Mova ride workspace">
      <button className="modal-dismiss icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>{children}
    </div>
  </div>;
}
function DemoLabel() { return <span className="demo-label"><span className="demo-dot" /> INTERACTIVE PROTOTYPE</span>; }

export default function App() {
  const service = useRideService();
  const [roomId, setRoomId] = useState(null);
  const showRoom = id => { setRoomId(id); setModal('room'); };
  const location = useCustomerLocation();
  const user = location.point;
  const [locationTick, setLocationTick] = useState(0);
  const [filter, setFilter] = useState('All rides');
  const [sort, setSort] = useState('nearest');
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem('mova-favorites') || '[]'); } catch { return []; } });
  const [selectedId, setSelectedId] = useState('mv-201');
  const [fullscreen, setFullscreen] = useState(false);
  const [modal, setModal] = useState(null);
  const [bookingVehicle, setBookingVehicle] = useState(null);
  const booked = service.state.rides;
  const currentRoom = service.state.rides.find(r => r.id === roomId) || service.active;
  const [mobileMenu, setMobileMenu] = useState(false);
  const pageWorkspace=useRef(null);
  useEffect(()=>{if(['book','room','history'].includes(modal))pageWorkspace.current?.scrollIntoView({block:'start'});},[modal]);

  useEffect(() => { document.body.classList.toggle('mova-fullscreen-active', fullscreen); return () => document.body.classList.remove('mova-fullscreen-active'); }, [fullscreen]);
  useEffect(() => { if (!fullscreen) return; const onKey = e => { if (e.key === 'Escape') setFullscreen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [fullscreen]);
  useEffect(() => { localStorage.setItem('mova-favorites', JSON.stringify(favorites)); }, [favorites]);

  const locate = () => {location.locate(); setLocationTick(n => n + 1);};
  const vehicles = useMemo(() => SEEDS.map(v => { const live = service.state.vehicles.find(x => x.id === v.id); return { ...v, ...(live?.position || vehicleOrigin(v)), online: !!live?.online, status: live?.busy ? 'Busy' : 'Available' }; }), [service.state.vehicles]);
  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = vehicles.filter(v =>
      (filter === 'All rides' || v.type === filter) &&
      (!onlyAvailable || (v.status === 'Available' && v.online)) &&
      (!savedOnly || favorites.includes(v.id)) &&
      (!term || [v.driver, v.plate, v.type, v.model].some(x => x.toLowerCase().includes(term)))
    );
    return list.sort((a, b) => sort === 'price' ? a.price - b.price : sort === 'rating' ? b.rating - a.rating : distanceKm(user, a) - distanceKm(user, b));
  }, [vehicles, filter, search, sort, user, onlyAvailable, savedOnly, favorites]);
  const selected = displayed.find(v => v.id === selectedId) || null;
  const activeCount = displayed.filter(v => v.status === 'Available' && v.online).length;
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
  return <div className={`app-shell ${fullscreen ? 'app-fullscreen' : ''}`}>
    <header className="topbar">
      <div className="topbar-brand"><Brand /><span className="brand-caption">MOVE THROUGH YOUR CITY</span></div>
      <nav className={`main-nav ${mobileMenu ? 'mobile-open' : ''}`} aria-label="Main navigation">
        <button className="nav-link current" onClick={() => { setModal(null); setSavedOnly(false); setMobileMenu(false); }}>Explore <span className="nav-current-dot" /></button>
        <button className="nav-link" onClick={() => { setModal('history'); setMobileMenu(false); }}>My rides {booked.length > 0 && <span className="nav-counter">{booked.length}</span>}</button>
        <button className={`nav-link ${savedOnly ? 'current' : ''}`} onClick={() => { setSavedOnly(v => !v); setMobileMenu(false); }}>Saved</button>
        <button className="nav-link" onClick={() => { setModal('about'); setMobileMenu(false); }}>How it works</button>
      </nav>
      <div className="header-actions"><button className="fullscreen-button" onClick={() => setFullscreen(v => !v)} title={fullscreen ? "Exit fullscreen (Esc)" : "Expand to fullscreen"} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</span></button><span className="header-location"><MapPin size={14} /> ASYV / Ntunga</span><span className="header-divider" /><button className="profile-badge" onClick={() => setModal('about')} aria-label="About Mova">M</button><button className="mobile-menu-btn icon-button" onClick={() => setMobileMenu(v => !v)} aria-label="Menu"><Menu size={20} /></button></div>
    </header>

    <main className="workspace">
      <section className="hero-intro">
        <div className="hero-copy"><div className="hero-eyebrow"><span className="eyebrow-line" /> THE SMARTER WAY TO MOVE <span className="slash-separator">/</span> ASYV / NTUNGA</div>
          <h1>There's a ride <em>around you.</em></h1>
          <p>Explore nearby drivers, compare prices, and find your way — all from one map.</p></div>
        <div className="hero-side"><button className="connect-driver-button" onClick={() => {window.location.hash='driver';}}><Phone size={15}/> Open Driver tab</button><DemoLabel /><div className="mini-stats"><div><span>AVAILABLE NEARBY</span><strong>{vehicles.filter(v => v.status === 'Available' && v.online).length.toString().padStart(2,'0')}<small> rides</small></strong></div><span className="stat-line" /><div><span>STARTING FROM</span><strong>900<small> RWF</small></strong></div></div></div>
      </section>

      <div className="ride-session-bar"><span className={service.connected ? 'session-connected' : 'session-disconnected'}>{service.connected ? 'Shared ride server connected' : 'Ride server reconnecting'}</span><span>Agree a fare. Meet your driver. Ride first, pay after.</span>{service.active && <button onClick={() => showRoom(service.active.id)}>Open active ride <ArrowRight size={14}/></button>}</div>
          <div className="pickup-location-bar" role="status"><Info size={14}/><span>{location.error || (location.status === 'live' ? 'Using your GPS pickup' : location.status === 'requesting' ? 'Finding your location...' : 'Customer pickup: ASYV / Driver: Ntunga')}</span><button onClick={locate}>Use my location <LocateFixed size={13}/></button></div>
      <section className={`explorer ${['book','room','history'].includes(modal) ? 'is-hidden' : ''}`} aria-label="Interactive vehicle finder">
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
            <GeoMap pickup={user} driver={NTUNGA} vehicles={displayed} selectedId={selected?.id} onSelect={chooseVehicle} initialView={locationTick ? 'route' : 'bikes'} fitKey={`discovery-${locationTick}-${location.status}`}/>
          </div>
          <div className="map-topbar"><div className="map-heading"><span className="map-geo-icon"><Navigation2 size={15}/></span><div><strong>{locationTick ? location.label : 'Ntunga bike rank'}</strong><span>{vehicles.filter(v=>v.type === 'Moto').length} motorbikes / select a plate</span></div></div></div>
          <div className="map-counter"><div className="radar-pip" /><span>{activeCount} drivers online</span><span className="map-counter-sep" /><span>Simulated positions</span></div>
          <div className="map-bottom-legend"><div><i className="legend-dot me" /> Demo pickup</div><div><i className="legend-dot free" /> Available</div><div><i className="legend-dot busy" /> Busy</div></div>
          {!selected && <div className="select-tip"><Crosshair size={16} /> Select a marker or ride to see details.</div>}
        </div>
        <div className="selected-driver-slot">          {selected && <div className="driver-details">
            <div className="detail-topline"><span>SELECTED RIDE <span className="detail-slash">/</span> {selected.id.toUpperCase()}</span><button className="detail-close" onClick={() => setSelectedId(null)} aria-label="Close vehicle details"><X size={16}/></button></div>
            <div className="detail-driver"><DriverAvatar vehicle={selected} size="large" /><div className="detail-name"><h3>{selected.driver}</h3><div><Star size={13} fill="currentColor" /> {selected.rating.toFixed(1)} <span>·</span> {selected.trips.toLocaleString()} trips</div></div><span className={`detail-status ${selected.status === 'Busy' ? 'status-busy' : ''}`}><span />{selected.status === 'Busy' ? 'Busy' : selected.online ? 'Online' : 'Offline'}</span></div>
            <div className="detail-vehicle"><div className="detail-type-symbol"><TypeIcon type={selected.type} size={20} /></div><div><strong>{selected.model}</strong><span>{selected.plate} · {selected.type}</span></div><div className="detail-fare"><strong>{money(selected.price)}</strong><span>Indicative fare</span></div></div>
            <div className="detail-specs"><div><Clock3 size={15}/><strong>{selected.eta} min</strong><span>est. arrival</span></div><div><Route size={15}/><strong>{formatDistance(distanceKm(user, selected))}</strong><span>straight-line</span></div><button onClick={() => googleDirections()}><Navigation2 size={15}/><strong>Directions</strong><span>Google Maps <ArrowUpRight size={10}/></span></button></div>
            <div className="detail-buttons"><button className="secondary-action" onClick={() => {window.location.hash='driver';}}><Phone size={16}/> Driver phone</button><button className="primary-action" onClick={openBook} disabled={selected.status !== 'Available'}>{selected.status === 'Available' ? 'Book this ride' : 'Driver unavailable'} <ArrowUpRight size={17}/></button></div>
          </div>}
</div>
      </section>
      {['book','room','history'].includes(modal) && <section className="presentation-workspace" ref={pageWorkspace} aria-label="Ride presentation workspace">
        <div className="workspace-page-heading"><div><span>YOUR JOURNEY / PAY AFTER ARRIVAL</span><h2>{modal === 'book' ? 'Plan your ride.' : modal === 'history' ? 'Your ride history.' : 'Your ride, live.'}</h2></div><button className="modal-secondary-button" onClick={()=>setModal(null)}>Back to bikes</button></div>
        {modal === 'book' && bookingVehicle && <div className="booking-page-layout"><GeoMap pickup={user} driver={bookingVehicle} path={[bookingVehicle,user]} fitKey="booking-map"/><div className="booking-page-form"><RideBooking vehicle={bookingVehicle} service={service} location={location} onCreated={showRoom} onConnect={()=>{window.location.hash='driver';}}/></div></div>}
        {modal === 'history' && <RideHistory service={service} onOpen={showRoom}/>}
        {modal === 'room' && (currentRoom ? <RideRoom key={currentRoom.id} ride={currentRoom} service={service}/> : <p className="modal-description">Loading your saved ride...</p>)}
      </section>}
      <footer className="app-footer"><span>© 2026 MOVA LAB <span className="footer-dot">·</span> MADE FOR THE CITY</span><span>ASYV / Ntunga. Simulated drivers. No payments processed. <button onClick={() => setModal('about')}>About this prototype <ArrowUpRight size={12}/></button></span></footer>
    </main>

    {modal === 'about' && <Modal onClose={() => setModal(null)} wide><div className="modal-kicker">HOW MOVA WORKS</div><h2>Find. Choose. Move<span className="orange-period">.</span></h2><p className="modal-description">Mova is a high-fidelity transport discovery concept designed for an effortless rider experience.</p><div className="how-grid"><div><div className="how-step">01</div><MapPin size={23}/><h3>Explore the map</h3><p>Choose your GPS pickup or ASYV. Switch to the Driver tab on a second device and select the same plate.</p></div><div><div className="how-step">02</div><Filter size={23}/><h3>Choose a ride</h3><p>Filter by ride type, compare sample prices, check plates, and view driver details.</p></div><div><div className="how-step">03</div><Wallet size={23}/><h3>Reserve in seconds</h3><p>Connect a driver phone, agree a fare together, verify pickup and record payment after the trip. No money is transferred by this app.</p></div></div><div className="demo-notice"><Info size={17}/><span>The customer starts at ASYV or their chosen GPS pickup. Simulated drivers start in Ntunga; Google driving routes are used when configured. Discovery positions, driver profiles, plates and listed fares are fictional. Ride requests, simulated driver movement and messages are shared through this server. Customer GPS is optional; driver identity and payment processing are not verified.</span></div><button className="modal-main-button" onClick={() => setModal(null)}>Start exploring <ArrowRight size={17}/></button></Modal>}
  </div>;
}
