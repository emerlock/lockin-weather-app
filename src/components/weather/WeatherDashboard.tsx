"use client";

import { useEffect, useState } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Disclosure,
  Switch,
} from "@headlessui/react";
import { useWeatherStore } from "@/store/weather-store";
import type { LocationSuggestion, WeatherData } from "@/types/weather";
import type { FormEvent } from "react";

const WMO_CODE_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

const WMO_CODE_ICONS: Record<number, string> = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  53: "🌦️",
  55: "🌧️",
  56: "🌧️",
  57: "🌧️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  66: "🌧️",
  67: "🌧️",
  71: "🌨️",
  73: "🌨️",
  75: "❄️",
  77: "🌨️",
  80: "🌦️",
  81: "🌧️",
  82: "⛈️",
  85: "🌨️",
  86: "❄️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

const FAVORITE_LOCATION_STORAGE_KEY = "weather.favoriteLocation";
const THEME_STORAGE_KEY = "weather.theme";

function parseLocationInput(value: string) {
  const [cityPart, statePart] = value.split(",").map((part) => part.trim());
  return {
    city: cityPart || "",
    state: statePart || "",
  };
}

function weatherLabelFromCode(code: number) {
  return WMO_CODE_LABELS[code] || `Unknown weather (${code})`;
}

function weatherIconFromCode(code: number) {
  return WMO_CODE_ICONS[code] || "🌡️";
}

function temperatureColorClass(temp: number, unit: "celsius" | "fahrenheit") {
  const celsius = unit === "celsius" ? temp : (temp - 32) * (5 / 9);
  if (celsius <= 0) return "text-blue-300";
  if (celsius <= 10) return "text-cyan-300";
  if (celsius <= 20) return "text-green-300";
  if (celsius <= 30) return "text-yellow-300";
  if (celsius <= 36) return "text-orange-300";
  return "text-red-400";
}

function buildWindyRadarUrl(latitude: number, longitude: number) {
  const lat = latitude.toFixed(4);
  const lon = longitude.toFixed(4);
  const params = new URLSearchParams({
    lat,
    lon,
    width: "650",
    height: "420",
    zoom: "7",
    level: "surface",
    overlay: "radar",
    product: "radar",
    menu: "false",
    message: "false",
    marker: "false",
    calendar: "now",
    pressure: "false",
    type: "map",
    location: "coordinates",
    detail: "false",
    metricWind: "default",
    metricTemp: "default",
    radarRange: "-1",
  });

  return `https://embed.windy.com/embed2.html?${params.toString()}`;
}

function formatOutlookDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatOutlookPrecipUnit(unit: string) {
  return unit === "inch" ? '"' : unit;
}

function formatOutlookPrecipValue(value: number) {
  return (Math.ceil(value * 100) / 100).toFixed(2);
}

function directionFromDegrees(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}

export function WeatherDashboard() {
  const city = useWeatherStore((store) => store.city);
  const state = useWeatherStore((store) => store.state);
  const unit = useWeatherStore((store) => store.unit);
  const setLocation = useWeatherStore((store) => store.setLocation);
  const toggleUnit = useWeatherStore((store) => store.toggleUnit);

  const [locationInput, setLocationInput] = useState(`${city}, ${state}`);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [favoriteLocation, setFavoriteLocation] =
    useState<LocationSuggestion | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const shouldUseDark = savedTheme !== "light";
    setIsDarkMode(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
    document.documentElement.style.colorScheme = shouldUseDark ? "dark" : "light";
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITE_LOCATION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<LocationSuggestion>;
      if (
        typeof parsed.city === "string" &&
        typeof parsed.state === "string" &&
        typeof parsed.label === "string"
      ) {
        const favorite = {
          city: parsed.city,
          state: parsed.state,
          label: parsed.label,
        };
        setFavoriteLocation(favorite);
        setLocation(favorite.city, favorite.state);
        setLocationInput(favorite.label);
      }
    } catch {
      localStorage.removeItem(FAVORITE_LOCATION_STORAGE_KEY);
    }
  }, [setLocation]);

  useEffect(() => {
    setLocationInput(`${city}, ${state}`);
  }, [city, state]);

  useEffect(() => {
    const query = locationInput.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const response = await fetch(
          `/api/locations?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        const payload = (await response.json()) as { data?: LocationSuggestion[] };
        setSuggestions(payload.data || []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [locationInput]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWeather() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ city, state, unit });
        const response = await fetch(`/api/weather?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error || "Failed to fetch weather");
        }

        const payload = (await response.json()) as { data: WeatherData };
        setWeather(payload.data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadWeather();
    return () => controller.abort();
  }, [city, state, unit]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseLocationInput(locationInput);
    if (!parsed.city || !parsed.state) {
      setError("Enter location in 'City, State' format.");
      return;
    }
    setLocation(parsed.city, parsed.state);
  }

  function saveFavoriteLocation() {
    const favorite = {
      city,
      state,
      label: `${city}, ${state}`,
    };
    setFavoriteLocation(favorite);
    localStorage.setItem(FAVORITE_LOCATION_STORAGE_KEY, JSON.stringify(favorite));
  }

  function clearFavoriteLocation() {
    setFavoriteLocation(null);
    localStorage.removeItem(FAVORITE_LOCATION_STORAGE_KEY);
  }

  function handleThemeToggle(nextDarkMode: boolean) {
    setIsDarkMode(nextDarkMode);
    document.documentElement.classList.toggle("dark", nextDarkMode);
    document.documentElement.style.colorScheme = nextDarkMode ? "dark" : "light";
    localStorage.setItem(THEME_STORAGE_KEY, nextDarkMode ? "dark" : "light");
  }

  const unitLabel = unit === "celsius" ? "C" : "F";
  const showDailyPrecipitation = (weather?.dailyPrecipitation ?? 0) > 0;
  const temperatureColor = weather
    ? temperatureColorClass(weather.temperature, weather.unit)
    : "text-[var(--foreground)]";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-10 md:px-8">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(37,99,235,0.15)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              LockIn Weather
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Fast weather, local favorites, and live radar.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Dark Mode
                </span>
                <Switch
                  checked={isDarkMode}
                  onChange={handleThemeToggle}
                  className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-300 transition data-[checked]:bg-[var(--secondary)]"
                >
                  <span className="size-4 translate-x-1 rounded-full bg-[var(--tertiary)] transition group-data-[checked]:translate-x-6" />
                </Switch>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Use Celsius
                </span>
                <Switch
                  checked={unit === "celsius"}
                  onChange={toggleUnit}
                  className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-300 transition data-[checked]:bg-[var(--primary)]"
                >
                  <span className="size-4 translate-x-1 rounded-full bg-[var(--tertiary)] transition group-data-[checked]:translate-x-6" />
                </Switch>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_16px_50px_rgba(139,92,246,0.12)]">
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          {favoriteLocation ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-[var(--text-muted)]">
                Favorite:
              </p>
              <button
                type="button"
                onClick={() => {
                  setLocation(favoriteLocation.city, favoriteLocation.state);
                  setLocationInput(favoriteLocation.label);
                }}
                className="font-semibold text-[var(--primary)] underline decoration-[var(--secondary)] underline-offset-2"
              >
                {favoriteLocation.label}
              </button>
              <button
                type="button"
                onClick={clearFavoriteLocation}
                aria-label="Clear favorite location"
                title="Clear favorite location"
                className="inline-flex items-center justify-center rounded-lg border border-red-400/60 bg-red-500/15 px-3 py-1.5 text-sm font-bold text-red-300 shadow-sm transition hover:bg-red-500/25"
              >
                X
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              No favorite location saved in this browser yet.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
        >
          <Combobox
            value={null}
            onChange={(value: LocationSuggestion | null) => {
              if (!value) return;
              setLocationInput(value.label);
              setLocation(value.city, value.state);
            }}
            as="div"
            className="relative sm:flex-1"
          >
            <ComboboxInput
              aria-label="Location"
              value={locationInput}
              onChange={(event) => setLocationInput(event.target.value)}
              placeholder="City, State (e.g. New York, NY)"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-[var(--foreground)] outline-none ring-[var(--primary)] focus:ring-2"
            />
            <ComboboxOptions className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl empty:hidden">
              {loadingSuggestions ? (
                <div className="px-3 py-2 text-sm text-[var(--text-muted)]">
                  Searching...
                </div>
              ) : null}
              {suggestions.map((item) => (
                <ComboboxOption
                  key={item.label}
                  value={item}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-[var(--foreground)] data-[focus]:bg-[var(--surface-muted)]"
                >
                  {item.label}
                </ComboboxOption>
              ))}
            </ComboboxOptions>
          </Combobox>
          <div className="flex gap-4">
            <div className="group relative">
              <button
                type="button"
                onClick={saveFavoriteLocation}
                aria-label="Favorite this location and set as default"
                className="inline-flex h-full items-center justify-center rounded-xl border border-[var(--secondary)] bg-[var(--surface-muted)] px-3 text-xl leading-none text-[var(--secondary)] hover:bg-[var(--surface)]"
              >
                ★
              </button>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-center text-xs text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
                Favorites this city and sets it as default.
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] px-4 py-2.5 font-semibold text-[var(--tertiary)] shadow-lg shadow-blue-500/20"
            >
              Search
            </button>
          </div>
        </form>

      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_16px_50px_rgba(37,99,235,0.1)]">
        {loading ? (
          <p className="text-[var(--text-muted)]">Loading weather...</p>
        ) : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        {!loading && !error && weather ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  City
                </p>
                <p className="text-xl font-semibold text-[var(--foreground)]">
                  {weather.city}
                  {weather.state ? `, ${weather.state}` : ""}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  Temperature
                </p>
                <p className={`text-xl font-semibold ${temperatureColor}`}>
                  {weather.temperature} {unitLabel}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  Current Weather
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {weatherIconFromCode(weather.weatherCode)}
                  </span>
                  <p className="text-xl font-semibold text-[var(--foreground)]">
                    {weatherLabelFromCode(weather.weatherCode)}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  Humidity
                </p>
                <p className="text-xl font-semibold text-[var(--foreground)]">
                  {weather.humidity}
                  {weather.humidityUnit}
                </p>
              </div>
            </div>

            <Disclosure
              as="div"
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]"
            >
              {({ open }) => (
                <>
                  <Disclosure.Button className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <span className="text-sm font-semibold text-[var(--foreground)]">
                      Additional Metrics
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">
                      {open ? "Hide" : "Show"}
                    </span>
                  </Disclosure.Button>
                  <Disclosure.Panel className="border-t border-[var(--border)] px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                          Wind Speed
                        </p>
                        <p className="text-xl font-semibold text-[var(--foreground)]">
                          {weather.windSpeed} {weather.windSpeedUnit}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                          Wind Direction
                        </p>
                        <p className="text-xl font-semibold text-[var(--foreground)]">
                          {weather.windDirection} {weather.windDirectionUnit} (
                          {directionFromDegrees(weather.windDirection)})
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                          Surface Pressure
                        </p>
                        <p className="text-xl font-semibold text-[var(--foreground)]">
                          {weather.surfacePressure} {weather.surfacePressureUnit}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                          Air Quality
                        </p>
                        <p className="text-xl font-semibold text-[var(--foreground)]">
                          {weather.airQualityIndex !== null
                            ? `${weather.airQualityIndex} (${weather.airQualityCategory})`
                            : "Unavailable"}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {weather.airQualityUnit}
                        </p>
                      </div>
                      {showDailyPrecipitation ? (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                            Estimated Precipitation (Today)
                          </p>
                          <p className="text-xl font-semibold text-[var(--foreground)]">
                            {weather.dailyPrecipitation} {weather.dailyPrecipitationUnit}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>
          </div>
        ) : null}
      </section>

      {!loading && !error && weather ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_16px_50px_rgba(37,99,235,0.1)]">
          <p className="mb-3 text-xs uppercase tracking-wide text-[var(--text-muted)]">
            5-Day Outlook
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {weather.dailyOutlook.map((day) => (
              <div
                key={day.date}
                className="relative rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3"
              >
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  {formatOutlookDate(day.date)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">
                    {weatherIconFromCode(day.weatherCode)}
                  </span>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {weatherLabelFromCode(day.weatherCode)}
                  </p>
                </div>
                <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                  {day.temperatureMax}° / {day.temperatureMin}°
                </p>
                {day.precipitation > 0 ? (
                  <p className="absolute bottom-2 right-2 text-[11px] font-medium text-[var(--text-muted)]">
                    {formatOutlookPrecipValue(day.precipitation)}{" "}
                    {formatOutlookPrecipUnit(weather.dailyPrecipitationUnit)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !error && weather ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(139,92,246,0.13)]">
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Windy Radar
          </p>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Live radar for {weather.city}
            {weather.state ? `, ${weather.state}` : ""}.
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <iframe
              title={`Windy radar for ${weather.city}${weather.state ? `, ${weather.state}` : ""}`}
              src={buildWindyRadarUrl(weather.latitude, weather.longitude)}
              className="h-[420px] w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}
