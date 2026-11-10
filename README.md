# Mova: ASYV / Ntunga shared ride demo

A React/Vite customer map, mobile driver workspace, and shared Node backend. Two people on separate devices can chat, negotiate, manage pickup and a trip, and record payment **after** completion. Customer GPS can supply the pickup. Driver movement from Ntunga is simulated; identities, plates and fares are fictional. No money is transferred.

Bookings, history and active rides open as large on-page workspaces, with a large map beside readable controls and chat on desktop and stacked sections on phones. The approach defaults to **15 seconds**. The Ntunga rank contains **12 selectable demo motorbikes** plus cars/taxis, each with its own parking pin, plate and fare. A driver device still has to select the chosen plate to receive and respond to its request.

Drag to pan, scroll the mouse wheel or pinch to zoom, or use the explicit zoom buttons. **Show all Ntunga bikes** returns to the bike rank; **Fit pickup route** shows pickup and driver together. Polling, animation and selecting a plate do not recenter the map or reset the current zoom. Google markers update their position in place rather than being rebuilt every animation frame.

## Run on two devices

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

1. Open Vite's Network address on both devices, for example `http://192.168.5.135:5173`. Use the same Wi-Fi, keep the computer awake and server running, and allow Node on your private network if Windows asks. Guest-network isolation may prevent connection.
2. On the driver device, open **Driver**, select a plate, and tap **Go online with this plate**. Keep the screen open to remain online. No QR invitation is required. A plate already selected on another driver device cannot be taken over; release it there or choose another.
3. On the other device, open **Customer** and choose the same plate. The initial pickup is **Agahozo-Shalom Youth Village (ASYV)**. Choose **Use my location** for GPS or enter a named pickup. Phone GPS needs HTTPS; on local HTTP use the ASYV pin or a named place.
4. Book, take the listed fare or make an offer, and choose a payment method for after the trip. Both sides can chat and counteroffer. Only the other person can accept the latest offer; the agreed fare is locked.
5. The driver chooses a demo duration and taps **I’m on the way**. Both devices see the same animated approach from **Ntunga**, with pause/resume and refresh recovery. Google driving geometry is shared when available; a fallback dashed connection is explicitly illustrative.
6. The driver marks arrival. The customer checks the plate in person and shares the pickup code only when ready. The driver enters it to start. The animation cannot start the trip or demand payment automatically.
7. The driver confirms completion. Only then can the customer report an external cash/MoMo payment. The driver checks receipt and confirms to close the ride. These buttons record acknowledgements, not transfers or wallet verification.

Use **My rides** / **Open active ride** after closing a panel or refreshing. Recent rides retain conversations and receipts. A driver can change or release the plate when no ride is active. A replacement driver session cannot see the previous driver's history. Earlier one-use invitation links remain supported, but the normal workflow uses the tabs.

`localhost` refers to the device itself: use the Network address on phones. Browser identities are scoped to the exact address and localStorage; use the same address to retain access. Customer and driver identities are separate, including when testing by switching tabs in one browser. Use only one server process for the shared store.

## Google Maps, GPS and routes

Save a browser key in the project-root `.env`, then restart Vite:

```dotenv
VITE_GOOGLE_MAPS_API_KEY=your_key
```

Enable Maps JavaScript API, Routes API and Geocoding API as needed, enable billing, and restrict the key to the exact website referrers used by your devices. Browser keys are visible in client code; do not commit them. The local `.env` was empty when this feature was tested, so actual Google access needs a saved usable key.

The app uses Google Maps when configured. Map-loading/authentication failures report the problem and fall back to OpenStreetMap. Routing failures use a clearly labelled illustrative connection instead of claiming a road route. Custom pickup names use geocoding and cannot silently reuse an unrelated pin if lookup fails. Chat and pay-after continue to work without Google.

The approximate initial customer pin is ASYV; the driver starts at the approximate Ntunga locality pin. Sources: [ASYV map pin](https://mapcarta.com/N4078852338), [Ntunga locality](https://www.geonames.org/search.html?q=Ntunga&country=RW), and [ASYV visitor directions](https://www.asyv.org/yourvisit/learn-more/2025/8/21/directions-to-asyv). These are reference points, not surveyed entrances. Select GPS or a geocoded place for the intended meeting point.

Routing follows [Google's Routes-library guide](https://developers.google.com/maps/documentation/javascript/routes/get-a-route). A driving path is computed once per pickup and sent to the shared server when the driver starts. Endpoints, coordinate bounds and payload size are validated. This is a driving-route demonstration, not motorcycle navigation or a real arrival estimate.

Both people see server-timed progress interpolated by distance along the same path. Pause/resume, refreshes and cancellation preserve its state. The simulated speed is independent of real travel time. Reaching the pickup pin cannot start/complete the trip or make payment due: manual arrival, pickup-code verification, trip completion and payment acknowledgement still apply. Earlier requests without a pickup pin retain history but must be cancelled before starting and rebooked for a mapped approach.

Phone GPS requires HTTPS (localhost is also allowed). For actual mobile GPS or devices on different networks, deploy the shared backend with HTTPS. This change does not publish the app or install certificates. GPS is opt-in; denial or failure leaves the selected/default pickup usable. The submitted pickup is frozen for that ride so later GPS jitter does not move the agreed meeting point. Coordinates are shared with the ride's participants, not included in the public vehicle list. Google and tile services receive map requests.

## Trip and payment safeguards

- No deposit, stored payment card, automatic charge, or prepayment control.
- Server-enforced roles, ownership, transitions, positive integer fares and input limits. New requests need an online driver.
- One open ride per customer and driver, including requests and unpaid completed trips; no double booking or silent abandonment of an unpaid ride.
- Explicit acceptance of the current offer, version checks for stale actions, and a locked agreed fare.
- A customer-only pickup code gates trip start. Five incorrect attempts lock entry for one minute. The code is not identity verification or proof of safe pickup.
- Before starting, either side may cancel with a reason, including a no-show. No cancellation charge. Cancelled rides cannot restart. Unaccepted requests expire after ten minutes; accepted trips do not auto-start or auto-complete.
- During a trip, report a problem and discuss it in chat. Payment acknowledgement pauses until its reporter clears the issue, or the driver waives a completed fare. Reporting does not contact staffed support or emergency services.
- Payment needs customer acknowledgement and driver receipt confirmation after completion. Non-receipt can be recorded without telling the customer to pay twice. The driver may explicitly waive the completed fare. No automatic collection or dispute adjudication.
- Keyed ride mutations are idempotent across retries. Driver enrollment can recover from an interrupted response using its device key. Competing updates fail with a conflict instead of overwriting each other.
- Polling runs about every 1.5 seconds. Connection loss pauses actions, preserves unsent chat drafts in the open panel, and resynchronizes location on reconnection. Background mobile tabs may suspend polling. No push notifications.
- At most 200 messages per ride and per-IP mutation rate limits. Message text is rendered as text.

## Storage and demo boundaries

The shared store is `.mova/ride-store.json`, ignored by Git. Accepted mutations write a temporary file and rename it into place; invalid mutations roll back. Invalid stored data fails startup rather than silently erasing rides. Back up the file if test history matters. Dev, preview and the built server use the same store; run only one at a time. Set `MOVA_STORE` for a different file.

Device keys stay in browser localStorage; their hashes are stored server-side. A driver sees only rides assigned to that session, and a customer sees only their own. Losing storage or changing the address loses access to that device identity. There is no verified vehicle ownership, account recovery, remote plate reset or admin console. Old browser-only demo bookings remain in localStorage but are not active server rides.

This is a private-network demo. Driver plate selection is open to your test group, not production authentication. Public operation needs HTTPS, verified accounts and vehicles, secure session recovery, a transactional database, backups/monitoring, real routing and opted-in driver GPS, staffed support, and payment-provider reconciliation if taking payments. The app cannot guarantee that a driver physically arrives or an external payment succeeds. It deliberately cannot collect money on an uncompleted ride.

## Built server

### Vercel deployment

Vercel must deploy the root `api/ride.js` function as well as the Vite frontend. `vercel.json` routes all `/api/*` requests to that function. The local file-backed store is unsuitable for independent serverless instances, so this function uses Postgres for shared sessions, plates, rides, driver heartbeats and request limits.

1. In the Vercel project's **Storage** section, connect a Postgres database (for example, Neon). Enable its environment variables for the deployment environment you use.
2. Ensure the provider's pooled connection string is available as **DATABASE_URL** or **POSTGRES_URL**, including its required SSL parameters. Keep it server-only; do not use a `VITE_` prefix. Use separate databases for Preview and Production so preview tests do not change live rides.
3. Deploy this repository with its project root pointing at this directory. The framework is **Vite**, the build command is **npm run build**, and the output directory is **dist**. Include the root `api` directory and `vercel.json` in the deployed source.
4. Redeploy after connecting storage. The function creates its `mova_ride_state` table automatically, so the database role needs table-creation permission on first use.
5. Open **/api/info** on the hosted domain. A ready backend returns JSON with the hosted URL. Then choose a driver plate on one device and request that same plate on another.

Without configured storage the function returns an explicit 503 error; it never creates temporary driver sessions that disappear on a cold start. Existing local `.mova` history is not automatically imported into the hosted database.

The database implementation serializes operations on one demo-state row and commits before acknowledging success. This preserves the existing ride rules across function instances and avoids conflicting plate claims. It is suitable for this small demo; a larger service needs normalized tables and indexed queries. Local `npm run dev`, `npm run preview`, and `npm start` continue to use the local file store.

### Run the built app locally

```sh
npm run build
npm start
```

Serves the app and API on `0.0.0.0:5173`; set `PORT` to change it. Static-only hosting of `dist` cannot supply the shared backend. `MOVA_DIST` can select a different built directory for isolated tests.

If a hosted site loads the map but plate selection fails, check `/api/info` on that same website. It must return JSON, not the app's HTML page or a hosting error. Deploy this project as a Node service with build command `npm ci && npm run build` and start command `npm start`, and keep `.mova` on persistent storage (or set `MOVA_STORE` to a file on a persistent volume). Run one server instance for the file-backed store. Publishing only `dist` will not connect customer and driver devices.

Slow state requests are allowed to finish before another poll starts. The app retries a failed initial customer connection automatically and resumes polling after a temporary outage; saved device sessions stay in place.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The Node suite covers ownership, roles, state transitions, negotiation, early-payment rejection, PIN throttling, duplicate/stale requests, double booking, cancellation, expiry, disputes, invitation recovery, durable restart, direct plate selection, coordinate/route validation, and shared simulation timing.

The browser suite uses independent mobile customer/driver sessions. It checks chat, negotiation, GPS pickup, synchronized movement, pause/resume, offline drafts, reload recovery, trip completion, pay-after, receipts and no-show cancellation. It starts an isolated built server on port 5180, with screenshots/traces in `test-results`. Build first. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing compatible browser executable.

`tests/google-maps.spec.js` tests the Google map/Routes adapter with mocked responses and a non-secret fixture key. It makes no paid requests and cannot verify a real Cloud project. It is skipped unless `MOVA_GOOGLE_TEST` is set; provide a separately built fixture directory via `MOVA_DIST` and optionally isolate the port using `MOVA_TEST_PORT`.
