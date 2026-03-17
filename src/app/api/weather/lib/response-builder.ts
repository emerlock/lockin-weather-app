import type { TemperatureUnit, WeatherApiResponse } from "@/types/weather";
import type { WeatherAlertEntry } from "./alerts";
import {
  createFiveDayOutlook,
  createTodayOutlook,
  findPeriodAtOrClosestToNow,
  parseForecastWindSpeed,
  roundNumber,
  roundTemperatureForDisplay,
  weatherCodeFromDescription,
  weatherDirectionFromText,
} from "./forecast";
import type { NwsForecastPeriod, NwsPointsResponse } from "./nws-client";
import type { CurrentObservation } from "./observations";
import type { ResolvedLocation } from "./geocode";

type BuildWeatherResponseInput = {
  activeAlerts: WeatherAlertEntry[];
  currentObservation: CurrentObservation;
  hourlyPeriods: NwsForecastPeriod[];
  location: ResolvedLocation;
  periods: NwsForecastPeriod[];
  pointsData: NwsPointsResponse;
  precipitationByDate: Record<string, number>;
  precipitationChanceByDate: Record<string, number>;
  precipitationUnit: string;
  unit: TemperatureUnit;
};

function normalizeForecastTemperatureUnit(
  value: string | undefined,
): "C" | "F" | "celsius" | "fahrenheit" {
  // Guard external forecast unit strings into the strict temperature-unit union used internally.
  if (value === "C" || value === "F" || value === "celsius" || value === "fahrenheit") {
    return value;
  }
  return "F";
}

export function buildWeatherResponse({
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
}: BuildWeatherResponseInput): WeatherApiResponse {
  // Assemble the final API response by combining observation data, forecast fallbacks, outlooks, and alerts.
  const fallbackCurrent =
    findPeriodAtOrClosestToNow(hourlyPeriods) ??
    findPeriodAtOrClosestToNow(periods) ??
    periods[0];

  const fallbackTemperatureUnit = normalizeForecastTemperatureUnit(
    fallbackCurrent?.temperatureUnit,
  );

  const forecastWeatherCode = weatherCodeFromDescription(
    currentObservation.description || fallbackCurrent?.shortForecast,
  );

  const currentTemperature =
    currentObservation.temperature ??
    roundTemperatureForDisplay(
      fallbackCurrent?.temperature ?? 0,
      fallbackTemperatureUnit,
      unit,
    );

  const fallbackWindSpeed =
    currentObservation.windSpeed ??
    parseForecastWindSpeed(fallbackCurrent?.windSpeed || "", unit);

  const windDirectionFromForecast =
    currentObservation.windDirection ??
    weatherDirectionFromText(
      fallbackCurrent?.windDirection || fallbackCurrent?.windDirectionCardinal,
    );

  const windDirectionValue =
    typeof windDirectionFromForecast === "number" ? windDirectionFromForecast : 0;

  const currentWindDirection = Number.isFinite(windDirectionValue)
    ? windDirectionValue
    : 0;
  const currentHumidity = currentObservation.humidity ?? 0;
  const currentPressure = currentObservation.surfacePressure ?? 0;

  const todayOutlook = createTodayOutlook(
    periods,
    unit,
    precipitationByDate,
    precipitationChanceByDate,
    pointsData.properties.timeZone,
  );

  const dailyOutlook = createFiveDayOutlook(
    periods,
    unit,
    precipitationByDate,
    precipitationChanceByDate,
    pointsData.properties.timeZone,
  );

  const dailyPrecipitation = todayOutlook?.precipitation ?? 0;

  return {
    data: {
      city: pointsData.properties.relativeLocation.properties.city || location.city,
      state: pointsData.properties.relativeLocation.properties.state || location.admin1 || null,
      latitude: location.latitude,
      longitude: location.longitude,
      temperature: roundNumber(currentTemperature, unit),
      windSpeed: roundNumber(fallbackWindSpeed, unit),
      windDirection: currentWindDirection,
      humidity: roundNumber(currentHumidity, "fahrenheit"),
      surfacePressure: roundNumber(currentPressure, "fahrenheit"),
      weatherCode: forecastWeatherCode,
      airQualityIndex: null,
      airQualityCategory: null,
      airQualityUnit: "US AQI",
      dailyPrecipitation,
      dailyPrecipitationUnit: precipitationUnit,
      windSpeedUnit: unit === "celsius" ? "kmh" : "mph",
      windDirectionUnit: "degrees",
      humidityUnit: "%",
      surfacePressureUnit: "hPa",
      activeAlerts,
      dailyOutlook,
      forecastTodayMax: todayOutlook?.temperatureMax ?? 0,
      forecastTodayMin: todayOutlook?.temperatureMin ?? 0,
      unit,
      fetchedAt: new Date().toISOString(),
    },
  };
}
