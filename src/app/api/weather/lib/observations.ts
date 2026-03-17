import type { TemperatureUnit } from "@/types/weather";
import {
  convertPressureToHPa,
  convertWindSpeed,
  isRecentObservationTimestamp,
  roundTemperatureForDisplay,
} from "./forecast";
import { fetchLatestObservation } from "./nws-client";

export type CurrentObservation = Partial<{
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  humidity: number | null;
  surfacePressure: number | null;
  description: string | null;
}>;

export async function fetchCurrentObservation(
  stationUrls: string[],
  unit: TemperatureUnit,
) {
  // Iterate candidate stations and return the first recent observation with normalized units.
  let currentObservation: CurrentObservation = {};
  const now = new Date();

  for (const stationUrl of stationUrls) {
    const latestObservation = await fetchLatestObservation(stationUrl);
    if (!latestObservation) continue;

    const observationProps = latestObservation.properties;
    if (!isRecentObservationTimestamp(observationProps.timestamp, now)) {
      continue;
    }

    const temp =
      observationProps.temperature?.value !== undefined &&
      observationProps.temperature?.value !== null
        ? roundTemperatureForDisplay(
            observationProps.temperature.value,
            observationProps.temperature.unitCode?.includes("degC") ? "C" : "F",
            unit,
          )
        : null;
    const windSpeed = observationProps.windSpeed?.value
      ? convertWindSpeed(
          observationProps.windSpeed.value,
          observationProps.windSpeed.unitCode || null,
          unit,
        )
      : null;
    const windDirection = observationProps.windDirection?.value || null;
    const humidity = observationProps.relativeHumidity?.value ?? null;
    const pressure = observationProps.barometricPressure?.value
      ? convertPressureToHPa(
          observationProps.barometricPressure.value,
          observationProps.barometricPressure.unitCode || null,
        )
      : null;

    currentObservation = {
      temperature: temp,
      windSpeed,
      windDirection,
      humidity,
      surfacePressure: pressure,
      description: observationProps.textDescription || null,
    };

    if (temp !== null) break;
  }

  return currentObservation;
}
