import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';

function vehicleIcon(v, selected) {
  const disabled = v.status !== 'Available';
  return L.divIcon({
    className: 'custom-marker-wrap',
    iconSize: [114, 49], iconAnchor: [57, 45],
    html: `<div class="ride-marker ${selected ? 'marker-selected' : ''} ${disabled ? 'marker-busy' : ''}"><span class="marker-monogram">${v.type === 'Moto' ? 'M' : v.type === 'Taxi' ? 'T' : 'C'}</span><span class="marker-label">${v.price.toLocaleString()}<small> RWF</small></span></div>`
  });
}
const userIcon = L.divIcon({
  className: 'custom-marker-wrap', iconSize: [32, 32], iconAnchor: [16, 16],
  html: '<div class="user-location-pin"><span></span></div>'
});

function MapBridge({ center, selected, locationTick, onReady }) {
  const map = useMap();
  const lastLocation = useRef(-1);
  useEffect(() => { onReady(map); return () => onReady(null); }, [map, onReady]);
  useEffect(() => {
    if (lastLocation.current !== locationTick) {
      lastLocation.current = locationTick;
      map.flyTo([center.lat, center.lng], 14, { duration: 1.1 });
    }
  }, [center, locationTick, map]);
  useEffect(() => {
    if (selected) map.flyTo([selected.lat, selected.lng], Math.max(14, map.getZoom()), { duration: 0.75 });
  }, [selected?.id, map]);
  return null;
}

export function OpenStreetMap({ center, vehicles, selected, onSelect, theme, locationTick, onMapReady, accuracy }) {
  const icons = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, vehicleIcon(v, selected?.id === v.id)])), [vehicles, selected?.id]);
  const line = selected ? [[center.lat, center.lng], [selected.lat, selected.lng]] : null;
  return <MapContainer center={[center.lat, center.lng]} zoom={14} className="leaflet-root" zoomControl={false} scrollWheelZoom={true}>
    <TileLayer
      key={theme}
      attribution={theme === 'dark' ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
      url={theme === 'dark' ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
      subdomains={theme === 'dark' ? ['a','b','c','d'] : ['a','b','c']}
      maxZoom={19}
    />
    <Circle center={[center.lat, center.lng]} radius={Math.min(Math.max(accuracy || 100, 45), 1000)} pathOptions={{ color: '#f16b50', weight: 1, fillColor: '#f16b50', fillOpacity: 0.07, opacity: 0.65 }} />
    <Marker position={[center.lat, center.lng]} icon={userIcon} zIndexOffset={500} />
    {line && <Polyline positions={line} pathOptions={{ color: '#f16b50', weight: 2.5, dashArray: '5, 9', opacity: 0.8 }} />}
    {vehicles.map(v => <Marker key={v.id} position={[v.lat, v.lng]} icon={icons[v.id]} eventHandlers={{ click: () => onSelect(v.id) }} zIndexOffset={selected?.id === v.id ? 700 : 0} />)}
    <MapBridge center={center} selected={selected} locationTick={locationTick} onReady={onMapReady} />
  </MapContainer>;
}

// Optional Google Maps JavaScript API integration. Keys are not required for the
// default OpenStreetMap experience or the basic Google iframe below.
const googlePromise = { value: null };
function loadGoogle(key) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googlePromise.value) return googlePromise.value;
  googlePromise.value = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps did not initialize'));
    script.onerror = () => { googlePromise.value = null; reject(new Error('Could not load Google Maps')); };
    document.head.appendChild(script);
  });
  return googlePromise.value;
}
export function GoogleMapView({ apiKey, center, vehicles, selected, onSelect, locationTick }) {
  const element = useRef(null);
  const mapRef = useRef(null);
  const overlays = useRef([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!apiKey) return;
    let active = true;
    loadGoogle(apiKey).then((maps) => {
      if (!active || !element.current) return;
      mapRef.current = new maps.Map(element.current, {
        center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        zoomControl: true, clickableIcons: false,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#202124' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#929292' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#202124' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#35363a' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111b24' }] }
        ]
      });
      setReady(true);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; overlays.current.forEach(x => x.setMap(null)); overlays.current = []; mapRef.current = null; };
  }, [apiKey]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const maps = window.google.maps;
    overlays.current.forEach(x => x.setMap(null));
    overlays.current = [];
    const user = new maps.Marker({ position: center, map: mapRef.current, title: 'Your location', zIndex: 1000, icon: { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#f16b50', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }});
    overlays.current.push(user);
    for (const v of vehicles) {
      const marker = new maps.Marker({ position: { lat: v.lat, lng: v.lng }, map: mapRef.current, title: `${v.driver} · ${v.plate}`, label: { text: v.type[0], color: '#fff', fontWeight: 'bold', fontSize: '12px' }, icon: { path: maps.SymbolPath.CIRCLE, scale: selected?.id === v.id ? 19 : 16, fillColor: v.status === 'Available' ? '#f16b50' : '#777777', fillOpacity: 1, strokeColor: '#171717', strokeWeight: 3 }});
      marker.addListener('click', () => onSelect(v.id));
      overlays.current.push(marker);
    }
    if (selected) {
      overlays.current.push(new maps.Polyline({ path: [center, { lat: selected.lat, lng: selected.lng }], map: mapRef.current, strokeColor: '#f16b50', strokeOpacity: 0.8, strokeWeight: 2 }));
      mapRef.current.panTo({lat: selected.lat,lng: selected.lng});
    }
  }, [ready, vehicles, center, selected?.id, onSelect]);
  useEffect(() => { if (ready) mapRef.current?.panTo(center); }, [locationTick, ready]);
  if (!apiKey) return <div className="google-embed-wrap">
    <iframe title="Google Maps — real embedded map" src={`https://www.google.com/maps?q=${center.lat},${center.lng}&z=14&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
    <div className="google-overlay-note"><strong>Google Maps embed</strong><span>Real map. To show clickable vehicle pins here, add a Google Maps API key to <code>.env</code>. Use Live map for vehicle pins now.</span></div>
  </div>;
  return <div className="google-native-wrap"><div ref={element} className="google-native-map" />{error && <div className="google-overlay-note"><strong>Google Maps error</strong><span>{error}. Switch back to Live map.</span></div>}</div>;
}
