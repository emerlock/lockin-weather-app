# LockIn Weather - Working Set

## Project Snapshot
- Stack: Next.js App Router (TypeScript), Tailwind CSS v4, Zustand, Headless UI.
- Primary app goal: city/state weather search with modern dark-first UI, local favorites, radar embed, PWA support.
- Current default theme: dark mode.

## Current Features
- Location search:
  - Single `City, State` input.
  - Keystroke autocomplete powered by Open-Meteo geocoding.
- Weather data:
  - Current metrics: city, temperature, current weather (WMO text + icon), humidity.
  - Additional metrics in accordion (default closed): wind speed, wind direction (degrees + compass), surface pressure, air quality (US AQI), daily precipitation.
  - 5-day outlook with:
    - daily icon + weather text
    - high/low temperatures (integers)
    - precipitation shown in tile bottom-right only when > 0
    - precipitation rounded up to nearest hundredth
    - inch unit displayed as `"` in outlook tiles
- Favorites:
  - Star button saves current location as default favorite (localStorage).
  - Favorite auto-loads on app start.
  - Favorite location text is clickable to reload.
  - Red `X` clears favorite.
- Windy radar:
  - Embedded radar-focused Windy iframe for selected coordinates.
- Theme:
  - Blue primary, purple secondary, white tertiary token system.
  - Dark mode default with persisted toggle.
- PWA:
  - Manifest route + icons.
  - Service worker registration.
  - Offline fallback route/page.

## API Endpoints
- `GET /api/weather?city=<city>&state=<state>&unit=<celsius|fahrenheit>`
  - Uses Open-Meteo:
    - Geocoding API (US-filtered, state match logic)
    - Forecast API (current + daily data)
    - Air Quality API (US AQI)
  - Returns normalized weather payload used by UI.
- `GET /api/locations?q=<query>`
  - Returns US `City, State` autocomplete suggestions.

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
- PWA:
  - `src/app/manifest.ts`
  - `public/sw.js`
  - `src/components/pwa/PwaRegister.tsx`
  - `src/app/offline/page.tsx`
  - `public/icons/*`
  - `public/favicon.svg`

## Local Run / Verify
- Dev: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`
- Start production build: `npm run start`

## Deployment
- Recommended target: Vercel (native Next.js support for App Router + API routes).

## Known Notes
- Browser favicon/PWA icons can be heavily cached; hard refresh or reinstall PWA when testing icon updates.
- Weather icons in component currently use emoji and render correctly, but ensure file encoding stays UTF-8 if edited externally.
