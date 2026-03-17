import type { TemperatureUnit, WeatherApiResponse } from "@/types/weather";

const WEATHER_RESPONSE_CACHE_TTL_MS = 2 * 60 * 1000;
const WEATHER_RESPONSE_CACHE_MAX_ENTRIES = 100;

const weatherResponseCache = new Map<
  string,
  { expiresAt: number; response: WeatherApiResponse }
>();

export function buildWeatherResponseCacheKey(
  city: string,
  state: string,
  unit: TemperatureUnit,
) {
  return `${city.trim().toLowerCase()}|${state.trim().toLowerCase()}|${unit}`;
}

export function getCachedWeatherResponse(cacheKey: string) {
  const cached = weatherResponseCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    weatherResponseCache.delete(cacheKey);
    return null;
  }

  return cached.response;
}

export function setCachedWeatherResponse(
  cacheKey: string,
  response: WeatherApiResponse,
) {
  if (weatherResponseCache.size >= WEATHER_RESPONSE_CACHE_MAX_ENTRIES) {
    const firstKey = weatherResponseCache.keys().next().value as string | undefined;
    if (firstKey) weatherResponseCache.delete(firstKey);
  }

  weatherResponseCache.set(cacheKey, {
    expiresAt: Date.now() + WEATHER_RESPONSE_CACHE_TTL_MS,
    response,
  });
}
