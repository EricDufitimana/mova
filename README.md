# Mova — live-map transport app prototype

**React + Vite + React Leaflet + optional Google Maps**. A high-fidelity, responsive transport discovery prototype using a real draggable/zoomable map, a geolocation permission prompt, nearby mock vehicles, fictional plates/driver profiles, ride filters, simulated calling, demo reservations and simulated mobile-money/card checkout.

## Run locally

```bash
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). Click **Allow location** if your browser asks. The map will center on your current coordinates. For hosted deployments, geolocation requires HTTPS (localhost is allowed).

**No Google API key is needed for the default working map.** It uses OpenStreetMap / CARTO tiles; tiles load over the internet. The Google Maps tab also includes a genuine embedded Google map even without an API key, but the iframe alone cannot support custom clickable vehicle markers. You can use the default **Live map** for those.

## Enable full Google Maps mode (optional)

1. Create a Google Cloud project, enable **Maps JavaScript API**, set up Google Maps Platform billing and restrict your browser API key by website referrers.
2. Copy `.env.example` to `.env` and fill in `VITE_GOOGLE_MAPS_API_KEY=...`.
3. Restart the Vite dev server.
4. Choose **Google Maps** in the map's top-right toggle. Google Maps will then render interactive vehicle markers and a user-position indicator.

Do **not** use Google's tile URLs with Leaflet or scrape map tiles. Use the official Maps JavaScript API with an authorized key for Google-based production maps. A `VITE_` key is visible in the browser, so **restrict it** via Google Cloud Console. It is not a backend secret.

## Prototype functionality

- Real pan/zoom map with OpenStreetMap/CARTO dark or standard tiles.
- Browser geolocation (watchPosition), map re-centering, accuracy circle; Kigali fallback if permission unavailable.
- Fictional sample vehicles with type, model, driver, plate, estimated arrival, demo fare, ratings, simulated availability, and relative distances.
- Vehicle pins, search, vehicle-type filters, availability-only toggle, saved vehicles, sort, and a selected-driver card.
- Google Maps directions link for selected vehicle coordinates.
- Genuine Google Maps iframe tab without a key; optional full Google Maps JavaScript integration when a key is configured.
- Call information dialog (does not dial a real phone number).
- Two-stage demo reservation + MTN MoMo / Airtel Money / Card selection (no charges, network payments or real dispatch).
- Demo bookings and favorites persisted only in the browser's localStorage.
- Responsive mobile layout and keyboard-accessible interface controls.

## Important note on data and privacy

**Every vehicle, driver, plate number, price, position, and booking is simulated.** When you allow location access, the app positions its fictional vehicles near your browser's current position to demonstrate how a local marketplace would feel. Real-time driver tracking, driver consent, plate validation, dispatch, calling and payments would require a genuine backend, authenticated drivers, user safeguards and payment-provider integration. No live personal location is sent to this prototype's backend (there is no backend), but map tile services and Google may receive map requests as you browse. Do not interpret the mocked plates as genuine vehicle registrations.

## Potential production architecture

- Supabase Auth + Postgres/PostGIS for drivers, vehicles, verified plates, and ride history.
- Realtime location updates **only** from opted-in, authenticated drivers. Protect exact locations through short-lived, passenger-authorized access.
- Server-validated fare estimates and dispatch locks to prevent double booking.
- Local payment gateway integration for MTN MoMo/Airtel Money with server-side verification and webhooks.
- Mask driver contact details until a booking is accepted, add moderation and anti-abuse safeguards.
- Use a proper routing API for road travel times. The prototype's distance is straight-line and its ETAs/fare estimates are fictional.

## Design reference

Inspired by the user's reference, [Conversion](https://conversion.framer.media/), borrowing a dark near-black canvas, strong sans-serif typography, muted strokes and sparing warm orange-red accents. UI is newly designed for a mobility app, rather than reproducing the site.

## Fullscreen and offline-safe mode (updated)
- Click the **Fullscreen** button in the top navigation; press **Esc** or click **Exit fullscreen** to return.
- Use **Live map** for interactive OpenStreetMap tiles and vehicle markers (internet required).
- Use **Offline demo** if your network blocks map tiles. It shows an illustrative Kigali diagram with interactive, simulated vehicle markers, **not** a geographic map or navigation data.
- Use **Google Maps** for a real embedded Google map; custom Google vehicle markers require `VITE_GOOGLE_MAPS_API_KEY` (see `.env.example`).
- GPS requires HTTPS or localhost and browser location permission.
- Driver positions, registration plates, fares, bookings, and payment screens are fictional. No transactions occur.
