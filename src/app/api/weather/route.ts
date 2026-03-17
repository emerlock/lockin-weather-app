import { NextRequest, NextResponse } from "next/server";
import type { TemperatureUnit } from "@/types/weather";
import {
  buildWeatherResponseCacheKey,
  getCachedWeatherResponse,
  setCachedWeatherResponse,
} from "./lib/cache";
import { fetchActiveWeatherAlerts } from "./lib/alerts";
import {
  noLocationErrorMessage,
  normalizeStateInput,
  resolveGeocodeData,
  selectBestLocationCandidate,
} from "./lib/geocode";
import {
  buildDailyPrecipitationChanceByDate,
  buildDailyPrecipitationTotals,
} from "./lib/forecast";
import {
  fetchNwsPoints,
  fetchNwsForecast,
  fetchOptionalGridQuantitativePrecipitation,
  fetchOptionalHourlyForecastPeriods,
  fetchStationUrls,
} from "./lib/nws-client";
import { fetchCurrentObservation } from "./lib/observations";
import { buildWeatherResponse } from "./lib/response-builder";

function normalizeUnit(value: string | null): TemperatureUnit {
  if (value === "celsius") return "celsius";
  return "fahrenheit";
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim() || "New York";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "";
  const unit = normalizeUnit(request.nextUrl.searchParams.get("unit"));
  const weatherCacheKey = buildWeatherResponseCacheKey(city, state, unit);
  const cachedResponse = getCachedWeatherResponse(weatherCacheKey);
  if (cachedResponse) {
    return NextResponse.json(cachedResponse);
  }

  const normalizedState = normalizeStateInput(state);
  const searchName = state ? `${city}, ${state}` : city;
  const normalizedStateInput = normalizedState.code || normalizedState.name || "";

  try {
    const geocodeData = await resolveGeocodeData(searchName);

    if (!geocodeData) {
      return NextResponse.json(
        { error: "Failed to geocode city" },
        { status: 502 },
      );
    }

    if (!geocodeData.result?.addressMatches || geocodeData.result.addressMatches.length === 0) {
      return NextResponse.json(
        {
          error: noLocationErrorMessage(city, state, searchName),
        },
        { status: 404 },
      );
    }

    const location = selectBestLocationCandidate(
      geocodeData,
      city,
      normalizedStateInput,
      Boolean(state),
    );

    if (!location) {
      return NextResponse.json(
        {
          error: noLocationErrorMessage(city, state, searchName),
        },
        { status: 404 },
      );
    }

    const pointsResult = await fetchNwsPoints(location.latitude, location.longitude);
    if (!pointsResult.ok) {
      return NextResponse.json(
        { error: "Failed to fetch NWS grid point" },
        { status: pointsResult.status },
      );
    }

    const pointsData = pointsResult.data;
    const forecastResult = await fetchNwsForecast(pointsData.properties.forecast);
    if (!forecastResult.ok) {
      return NextResponse.json(
        { error: "Failed to fetch NWS forecast" },
        { status: forecastResult.status },
      );
    }

    const periods = forecastResult.data.properties.periods || [];
    const hourlyPeriods = await fetchOptionalHourlyForecastPeriods(
      pointsData.properties.forecastHourly,
    );

    let precipitationByDate: Record<string, number> = {};
    let precipitationUnit = unit === "celsius" ? "mm" : "in";
    const precipitationChanceByDate = buildDailyPrecipitationChanceByDate(
      periods,
      pointsData.properties.timeZone,
    );

    const quantitativePrecipitation = await fetchOptionalGridQuantitativePrecipitation(
      pointsData.properties.forecastGridData,
    );
    if (quantitativePrecipitation) {
      const unitCode = quantitativePrecipitation.uom || "";
      const built = buildDailyPrecipitationTotals(
        quantitativePrecipitation.values,
        unitCode,
        unit,
      );
      precipitationByDate = built.precipitationByDate;
      precipitationUnit = built.unit;
    }

    const stationUrls = await fetchStationUrls(pointsData.properties.observationStations);
    const currentObservation = await fetchCurrentObservation(stationUrls, unit);
    const activeAlerts = await fetchActiveWeatherAlerts(location.latitude, location.longitude, pointsData);
    const response = buildWeatherResponse({
      activeAlerts,
      currentObservation,
      hourlyPeriods,
      location,
      periods,
      pointsData,
      precipitationByDate,
      precipitationChanceByDate,
      precipitationUnit,
      unit,
    });

    setCachedWeatherResponse(weatherCacheKey, response);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while fetching weather data from NWS" },
      { status: 500 },
    );
  }
}
