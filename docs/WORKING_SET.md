# LockIn Weather - Working Set

## Project Snapshot
- Stack: Next.js App Router (TypeScript), Tailwind CSS v4, Zustand, Headless UI.
- Primary app goal: city/state weather search using National Weather Service (NWS) data, local favorites, radar embed, and PWA support.

## Current Features
- Location search:
  - Single `City, State` input.
  - Fuzzy autocomplete with stronger matching.
  - Geocoding path adapted to an NWS-compatible public geocoder source.
- Weather data:
  - Current metrics emphasize forecast area values and include:
    - current temperature
    - forecasted high/low
    - current weather
    - humidity, wind, pressure
  - Current temperature uses recent NWS station observations when available, with forecast fallback behavior.
  - Today high/low logic aligned to today's NWS forecast day.
  - Daily precipitation amount shown as measurement units and rounded to hundredths.
  - If estimated precipitation is `0.00`, precipitation amount can be hidden.
  - 5-day outlook starts with tomorrow.
  - 5-day outlook includes precipitation amount and precipitation percent chance labeling (`Precip:`).
- 5-day outlook with:
  - daily icon + weather text
  - high/low temperatures
  - precipitation amount and chance (with clearer precipitation labeling)
- Favorites:
  - Star button saves current location as default favorite (localStorage).
  - Favorite auto-loads on app start.
  - Favorite location text is clickable to reload.
  - Red `X` clears favorite.
- Active alerts:
  - Separate alerts section above current weather section.
  - Alerts section hidden when there are no active alerts.
  - Collapsible alert content/readability improvements.
  - Visual severity badges.
  - Alert retrieval includes active CAP alerts plus HWO augmentation logic.
- Windy radar:
  - Embedded radar-focused Windy iframe for selected coordinates.
- PWA:
  - Manifest route + icons.
  - Service worker registration.
  - Offline fallback route/page.
- UI/UX:
  - Loading spinner behavior improved for weather request loading states.
  - Footer note restored: weather data provided by NWS.

## API Endpoints
- `GET /api/weather?city=<city>&state=<state>&unit=<celsius|fahrenheit>`
  - Uses NWS-backed flow:
    - Geocoder resolution for city/state search
    - NWS points API
    - NWS forecast + hourly + grid data
    - NWS observation stations/latest observations for current temperature fallback
    - NWS active alerts + HWO handling
  - Includes response caching.
  - Returns normalized weather payload used by UI, including active alerts and precipitation details.
- `GET /api/locations?q=<query>`
  - Returns US `City, State` autocomplete suggestions with stronger fuzzy matching.

## Important Files
- App shell/layout:
  - `src/app/layout.tsx`
  - `src/app/globals.css`
  - `src/app/page.tsx`
- UI:
  - `src/components/weather/WeatherDashboard.tsx`
- State/types:
  - `src/store/weather-store.ts`
  - `src/types/weather.ts`
- API routes:
  - `src/app/api/weather/route.ts`
  - `src/app/api/locations/route.ts`
- Weather API modules (route split):
  - `src/app/api/weather/lib/cache.ts`
  - `src/app/api/weather/lib/alerts.ts`
  - `src/app/api/weather/lib/geocode.ts`
  - `src/app/api/weather/lib/forecast.ts`
  - `src/app/api/weather/lib/nws-client.ts`
  - `src/app/api/weather/lib/observations.ts`
  - `src/app/api/weather/lib/response-builder.ts`
- Constants/properties:
  - `src/constants/weather.ts`
- PWA:
  - `src/app/manifest.ts`
  - `public/sw.js`
  - `src/components/pwa/PwaRegister.tsx`
  - `src/app/offline/page.tsx`
  - `public/icons/*`
  - `public/favicon.svg`
- Unit tests:
  - `src/app/api/weather/lib/forecast.test.ts`
  - `src/app/api/weather/lib/response-builder.test.ts`
  - `vitest.config.ts`

## Local Run / Verify
- Dev: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`
- Start production build: `npm run start`
- Unit tests: `npm test`
- Watch tests: `npm run test:watch`

## Deployment
- Recommended target: Vercel (native Next.js support for App Router + API routes).

## Known Notes
- Browser favicon/PWA icons can be heavily cached; hard refresh or reinstall PWA when testing icon updates.
- NWS observations may be stale/unavailable for some stations; fallback to forecast logic is expected.
- Alert discrepancies can occur if area/zone matching differs between local point resolution and headline coverage text.
