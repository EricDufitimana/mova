# Mova — live-map transport app prototype

**React + Vite + React Leaflet + optional Google Maps**. A high-fidelity, responsive transport discovery prototype using a real draggable/zoomable map, a fixed Kigali demo pickup, nearby mock vehicles, fictional plates/driver profiles, ride filters, simulated calling, demo reservations and simulated mobile-money/card checkout.

## Run locally

```bash
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). The demo opens at a fixed Kigali city-centre pickup without requesting location permission.

**No Google API key is needed.** The default **Kigali map** immediately renders a bundled illustration with interactive vehicle pins. Real CARTO/OpenStreetMap street tiles load above it when the network allows. If tiles fail or take longer than eight seconds, a status notice explains that the illustration is shown; filtering, selection, pan/zoom and demo bookings continue to work. Google Maps is offered only when a key is configured.

## Enable full Google Maps mode (optional)

1. Create a Google Cloud project, enable **Maps JavaScript API**, set up Google Maps Platform billing and restrict your browser API key by website referrers.
2. Copy `.env.example` to `.env` and fill in `VITE_GOOGLE_MAPS_API_KEY=...`.
3. Restart the Vite dev server.
4. Choose **Google Maps** in the map's top-right toggle. Google Maps will then render interactive vehicle markers and a user-position indicator.

Do **not** use Google's tile URLs with Leaflet or scrape map tiles. Use the official Maps JavaScript API with an authorized key for Google-based production maps. A `VITE_` key is visible in the browser, so **restrict it** via Google Cloud Console. It is not a backend secret.

## Prototype functionality

- Real pan/zoom map with OpenStreetMap/CARTO dark or standard tiles.
- Fixed Kigali demo pickup, recenter control and nearby simulated vehicle positions; no geolocation prompt.
- Fictional sample vehicles with type, model, driver, plate, estimated arrival, demo fare, ratings, simulated availability, and relative distances.
- Vehicle pins, search, vehicle-type filters, availability-only toggle, saved vehicles, sort, and a selected-driver card.
- Google Maps directions link for selected vehicle coordinates.
- Optional Google Maps JavaScript integration when a key is configured.
- Call information dialog (does not dial a real phone number).
- Three-step booking: choose pickup/destination, choose a normal or negotiated fare, then select Cash / MTN MoMo / Airtel Money / Card. Kigali landmarks and custom place names work without an API key.
- Local demo negotiation: send an offer with an optional message, receive a simulated acceptance or counteroffer, and explicitly agree the fare before checkout. Editing the trip or offer resets the agreement.
- My rides stores the pickup, destination, payment method, normal/negotiated choice, listed fare and final agreed amount in this browser. No real messages, charges or driver dispatch occur.
- Demo bookings and favorites persisted only in the browser's localStorage.
- Responsive mobile layout and keyboard-accessible interface controls.

## Important note on data and privacy

**Every vehicle, driver, plate number, price, position, and booking is simulated.** Fictional vehicles are placed around a fixed demo pickup in Kigali. Real-time driver tracking, driver consent, plate validation, dispatch, calling and payments would require a genuine backend, authenticated drivers, user safeguards and payment-provider integration. The app does not request or track device location (there is no backend), but map tile services and Google may receive map requests as you browse. Do not interpret the mocked plates as genuine vehicle registrations.

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
- Use **Kigali map** for interactive vehicle markers on a bundled schematic, with real street tiles when available. The schematic is illustrative and is not navigation data.
- Use **Offline demo** if your network blocks map tiles. It shows an illustrative Kigali diagram with interactive, simulated vehicle markers, **not** a geographic map or navigation data.
- The **Google Maps** option appears only when `VITE_GOOGLE_MAPS_API_KEY` is configured.
- Driver positions, registration plates, fares, bookings, and payment screens are fictional. No transactions occur.
