import { NWS_API_BASE, NWS_HEADERS } from "@/constants/weather";

export type NwsForecastPeriod = {
  startTime: string;
  endTime?: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  icon: string;
  isDaytime: boolean;
  probabilityOfPrecipitation?: {
    value: number | null;
  };
  windDirectionCardinal?: string;
};

export interface NwsPointsResponse {
  properties: {
    forecast: string;
    forecastHourly?: string;
    forecastGridData?: string;
    timeZone?: string;
    forecastOffice?: string;
    forecastZone?: string;
    county?: string;
    fireWeatherZone?: string;
    observationStations: string;
    relativeLocation: {
      properties: {
        city: string;
        state: string;
      };
    };
  };
}

export interface NwsForecastResponse {
  properties: {
    periods: NwsForecastPeriod[];
  };
}

export interface NwsGridQuantitativePrecipitation {
  uom?: string;
  values?: Array<{
    validTime: string;
    value: number | null;
  }>;
}

interface NwsForecastGridResponse {
  properties: {
    quantitativePrecipitation?: NwsGridQuantitativePrecipitation;
  };
}

interface NwsStationsResponse {
  features: Array<{
    id: string;
  }>;
}

export interface NwsObservationResponse {
  properties: {
    timestamp?: string | null;
    temperature?: {
      value: number | null;
      unitCode?: string | null;
    } | null;
    windSpeed?: {
      value: number | null;
      unitCode?: string | null;
    } | null;
    windDirection?: {
      value: number | null;
      unitCode?: string | null;
    } | null;
    relativeHumidity?: {
      value: number | null;
      unitCode?: string | null;
    } | null;
    barometricPressure?: {
      value: number | null;
      unitCode?: string | null;
    } | null;
    textDescription?: string | null;
  };
}

type NwsResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number };

async function fetchWithNwsHeaders(url: string, init?: RequestInit) {
  // Centralized fetch wrapper so every NWS request includes required headers.
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      ...NWS_HEADERS,
    },
  });
}

async function fetchNwsJson<T>(url: string, init?: RequestInit): Promise<NwsResult<T>> {
  // Standardized JSON request helper that preserves upstream HTTP status for route-level handling.
  const response = await fetchWithNwsHeaders(url, init);
  if (!response.ok) return { ok: false, status: response.status };
  const data = (await response.json()) as T;
  return { ok: true, status: response.status, data };
}

export async function fetchNwsPoints(latitude: number, longitude: number) {
  // Resolve point metadata (forecast URLs, zones, stations) for a lat/lon.
  const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  return fetchNwsJson<NwsPointsResponse>(pointsUrl, {
    next: { revalidate: 60 * 10 },
  });
}

export async function fetchNwsForecast(forecastUrl: string) {
  // Fetch standard NWS period forecast.
  return fetchNwsJson<NwsForecastResponse>(forecastUrl, {
    next: { revalidate: 60 * 10 },
  });
}

export async function fetchOptionalHourlyForecastPeriods(forecastHourlyUrl?: string) {
  // Fetch hourly periods when available; return empty list on missing URL or failure.
  if (!forecastHourlyUrl) return [] as NwsForecastPeriod[];
  const result = await fetchNwsJson<NwsForecastResponse>(forecastHourlyUrl, {
    next: { revalidate: 60 * 10 },
  });
  if (!result.ok) return [] as NwsForecastPeriod[];
  return result.data.properties.periods || [];
}

export async function fetchOptionalGridQuantitativePrecipitation(
  forecastGridUrl?: string,
) {
  // Fetch quantitative precipitation grid values for daily accumulation calculations.
  if (!forecastGridUrl) return null;
  const result = await fetchNwsJson<NwsForecastGridResponse>(forecastGridUrl, {
    next: { revalidate: 60 * 10 },
  });
  if (!result.ok) return null;
  return result.data.properties.quantitativePrecipitation || null;
}

export async function fetchStationUrls(observationStationsUrl: string) {
  // Fetch candidate station endpoints used to obtain latest observations.
  const result = await fetchNwsJson<NwsStationsResponse>(observationStationsUrl);
  if (!result.ok) return [] as string[];
  return (result.data.features || []).map((feature) => feature.id).filter(Boolean);
}

export async function fetchLatestObservation(stationUrl: string) {
  // Fetch the most recent observation payload for a specific station.
  const result = await fetchNwsJson<NwsObservationResponse>(
    `${stationUrl}/observations/latest`,
  );
  if (!result.ok) return null;
  return result.data;
}
