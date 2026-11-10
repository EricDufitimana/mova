import { NTUNGA } from './data.js';
export const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
let pending;
export function loadGoogle() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (!GOOGLE_API_KEY) return Promise.reject(new Error('Google Maps key is not configured. Save VITE_GOOGLE_MAPS_API_KEY in .env and restart the server.'));
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('Google Maps took too long to load. Check your connection.')), 15000);
    window.gm_authFailure = () => { clearTimeout(timer); window.dispatchEvent(new Event('mova-map-auth-error')); reject(new Error('Google Maps rejected this key. Check billing, enabled APIs and website restrictions.')); };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_API_KEY)}&v=weekly&loading=async&callback=movaGoogleReady`;
    script.async = true;
    window.movaGoogleReady = () => {clearTimeout(timer); resolve(window.google.maps);};
    script.onerror = () => {clearTimeout(timer); reject(new Error('Google Maps could not load. Check your connection and key.'));};
    document.head.appendChild(script);
  });
  return pending;
}
const routeCache = new Map();
export async function pickupRoute(pickup, origin=NTUNGA) {
  const key = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}-${pickup.lat.toFixed(5)},${pickup.lng.toFixed(5)}`;
  if (!routeCache.has(key)) routeCache.set(key, (async () => {
    const maps = await loadGoogle();
    const {Route} = await maps.importLibrary('routes');
    const {routes} = await Route.computeRoutes({origin, destination:pickup, travelMode:'DRIVING', fields:['path','distanceMeters','durationMillis']});
    const route = routes?.[0];
    if (!route?.path?.length) throw new Error('No driving route found to this pickup.');
    const points = route.path.map(p => ({lat:typeof p.lat === 'function' ? p.lat() : p.lat, lng:typeof p.lng === 'function' ? p.lng() : p.lng}));
    // Bound the shared payload without losing either endpoint.
    const path = points.length <= 390 ? points : Array.from({length:390}, (_, i) => points[Math.round(i * (points.length - 1) / 389)]);
    return {source:'google', path, distanceMeters:route.distanceMeters, durationMillis:route.durationMillis};
  })());
  try {return await routeCache.get(key);} catch (error) {routeCache.delete(key); throw error;}
}
export async function locateAddress(address) {
  const maps = await loadGoogle(); const {Geocoder} = await maps.importLibrary('geocoding');
  const {results} = await new Geocoder().geocode({address, region:'rw', componentRestrictions:{country:'RW'}});
  if (!results?.length) throw new Error('Pickup not found. Choose ASYV, Ntunga, or use your location.');
  const point = results[0].geometry.location;
  return {lat:point.lat(), lng:point.lng()};
}
