export const API_URLS = {
  nws: {
    base: "https://api.weather.gov",
  },
  census: {
    geocoder: {
      onelineAddress: "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
      address: "https://geocoding.geo.census.gov/geocoder/locations/address",
    },
  },
  nominatim: {
    search: "https://nominatim.openstreetmap.org/search",
  },
  openMeteo: {
    geocodeSearch: "https://geocoding-api.open-meteo.com/v1/search",
  },
} as const;
