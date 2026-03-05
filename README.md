# Weather Web App Scaffold (Next.js)

Next.js App Router scaffold in TypeScript with:
- Tailwind CSS
- Zustand state management
- Headless UI
- API route layer (`/api/weather`)

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Project Structure

```text
src/
  app/
    api/weather/route.ts
    globals.css
    layout.tsx
    page.tsx
  components/
    weather/WeatherDashboard.tsx
  store/
    weather-store.ts
  types/
    weather.ts
```

## API

`GET /api/weather?city=New York&state=NY&unit=fahrenheit`

- `city`: string, defaults to `New York`
- `state`: string, defaults to `NY`
- `unit`: `celsius` or `fahrenheit`, defaults to `fahrenheit`

The route geocodes the city and fetches current conditions from Open-Meteo.

`GET /api/locations?q=new york`

- Returns autocomplete suggestions in `City, State` format for US locations.
