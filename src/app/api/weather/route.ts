import { NextRequest, NextResponse } from "next/server";
import type { TemperatureUnit, WeatherApiResponse } from "@/types/weather";

interface GeocodingApiResponse {
  results?: Array<{
    name: string;
    admin1?: string;
    country_code?: string;
    latitude: number;
    longitude: number;
  }>;
}

interface ForecastApiResponse {
  current?: {
    temperature_2m: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    relative_humidity_2m: number;
    surface_pressure: number;
    weather_code: number;
  };
  current_units?: {
    wind_speed_10m?: string;
    wind_direction_10m?: string;
    relative_humidity_2m?: string;
    surface_pressure?: string;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
  };
  daily_units?: {
    precipitation_sum?: string;
  };
}

interface AirQualityApiResponse {
  current?: {
    us_aqi?: number;
  };
  current_units?: {
    us_aqi?: string;
  };
}

function normalizeUnit(value: string | null): TemperatureUnit {
  if (value === "celsius") return "celsius";
  return "fahrenheit";
}

function airQualityCategoryFromUsAqi(value: number | null) {
  if (value === null) return null;
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  if (value <= 150) return "Unhealthy for Sensitive Groups";
  if (value <= 200) return "Unhealthy";
  if (value <= 300) return "Very Unhealthy";
  return "Hazardous";
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const STATE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name]),
);

function normalizeStateInput(state: string) {
  const trimmed = state.trim();
  if (!trimmed) return { code: null as string | null, name: null as string | null };

  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && STATE_CODE_TO_NAME[upper]) {
    return {
      code: upper,
      name: STATE_CODE_TO_NAME[upper],
    };
  }

  const lower = trimmed.toLowerCase();
  const code = STATE_NAME_TO_CODE[lower] || null;
  return {
    code,
    name: lower,
  };
}

function admin1MatchesState(admin1: string | undefined, stateInput: string) {
  if (!admin1 || !stateInput) return false;
  const normalized = normalizeStateInput(stateInput);
  const admin1Lower = admin1.toLowerCase();
  const admin1Code = STATE_NAME_TO_CODE[admin1Lower] || null;
  if (normalized.code && admin1Code && normalized.code === admin1Code) return true;
  if (normalized.name && admin1Lower === normalized.name) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim() || "New York";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "";
  const unit = normalizeUnit(request.nextUrl.searchParams.get("unit"));
  const temperatureUnitParam = unit === "celsius" ? "celsius" : "fahrenheit";
  const windUnitParam = unit === "celsius" ? "kmh" : "mph";
  const searchName = state ? `${city}, ${state}` : city;

  try {
    const geocodeParams = new URLSearchParams({
      name: city,
      countryCode: "US",
      count: "20",
      language: "en",
      format: "json",
    });

    const geocodeResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${geocodeParams.toString()}`,
      { next: { revalidate: 60 * 30 } },
    );

    if (!geocodeResponse.ok) {
      return NextResponse.json(
        { error: "Failed to geocode city" },
        { status: geocodeResponse.status },
      );
    }

    const geocodeData =
      (await geocodeResponse.json()) as GeocodingApiResponse;
    const candidates = geocodeData.results || [];
    const location = state
      ? candidates.find((entry) => admin1MatchesState(entry.admin1, state))
      : candidates[0];

    if (!location) {
      return NextResponse.json(
        {
          error: state
            ? `No US location found for "${searchName}". Try full state name or 2-letter code.`
            : `No US location found for "${city}"`,
        },
        { status: 404 },
      );
    }

    const forecastParams = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current:
        "temperature_2m,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,weather_code",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
      temperature_unit: temperatureUnitParam,
      wind_speed_unit: windUnitParam,
      precipitation_unit: unit === "celsius" ? "mm" : "inch",
      timezone: "auto",
    });

    const forecastResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`,
      { next: { revalidate: 60 * 10 } },
    );

    const airQualityParams = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "us_aqi",
      timezone: "auto",
    });

    const airQualityResponse = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${airQualityParams.toString()}`,
      { next: { revalidate: 60 * 10 } },
    );

    if (!forecastResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch forecast" },
        { status: forecastResponse.status },
      );
    }

    const forecastData =
      (await forecastResponse.json()) as ForecastApiResponse;
    if (!forecastData.current) {
      return NextResponse.json(
        { error: "Forecast response missing current weather data" },
        { status: 502 },
      );
    }

    const dailyPrecipitation = forecastData.daily?.precipitation_sum?.[0] ?? 0;
    const dailyPrecipitationUnit =
      forecastData.daily_units?.precipitation_sum ||
      (unit === "celsius" ? "mm" : "inch");
    const dailyOutlook = (forecastData.daily?.time || [])
      .slice(0, 5)
      .map((date, index) => ({
        date,
        weatherCode: forecastData.daily?.weather_code?.[index] ?? 0,
        temperatureMax: Math.round(
          forecastData.daily?.temperature_2m_max?.[index] ?? 0,
        ),
        temperatureMin: Math.round(
          forecastData.daily?.temperature_2m_min?.[index] ?? 0,
        ),
        precipitation: forecastData.daily?.precipitation_sum?.[index] ?? 0,
      }));
    const airQualityData = airQualityResponse.ok
      ? ((await airQualityResponse.json()) as AirQualityApiResponse)
      : null;
    const airQualityIndex = airQualityData?.current?.us_aqi ?? null;
    const airQualityUnit = airQualityData?.current_units?.us_aqi || "US AQI";

    const response: WeatherApiResponse = {
      data: {
        city: location.name,
        state: location.admin1 || null,
        latitude: location.latitude,
        longitude: location.longitude,
        temperature: Math.round(forecastData.current.temperature_2m),
        windSpeed: forecastData.current.wind_speed_10m,
        windDirection: forecastData.current.wind_direction_10m,
        humidity: forecastData.current.relative_humidity_2m,
        surfacePressure: forecastData.current.surface_pressure,
        weatherCode: forecastData.current.weather_code,
        airQualityIndex,
        airQualityCategory: airQualityCategoryFromUsAqi(airQualityIndex),
        airQualityUnit,
        dailyPrecipitation,
        dailyPrecipitationUnit,
        windSpeedUnit: forecastData.current_units?.wind_speed_10m || windUnitParam,
        windDirectionUnit: forecastData.current_units?.wind_direction_10m || "degrees",
        humidityUnit: forecastData.current_units?.relative_humidity_2m || "%",
        surfacePressureUnit: forecastData.current_units?.surface_pressure || "hPa",
        dailyOutlook,
        unit,
        fetchedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while fetching weather data" },
      { status: 500 },
    );
  }
}
