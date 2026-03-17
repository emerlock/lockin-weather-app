import type { DailyOutlook, TemperatureUnit } from "@/types/weather";

type ForecastPeriod = {
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

type GridForecastValue = {
  validTime: string;
  value: number | null;
};

type DailyOutlookEntry = DailyOutlook;

export function isRecentObservationTimestamp(
  timestamp: string | null | undefined,
  now: Date = new Date(),
) {
  // Accept only recent observations (up to 3 hours old) to avoid stale station data.
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  const ageMs = now.getTime() - parsed;
  return ageMs >= 0 && ageMs <= 3 * 60 * 60 * 1000;
}

function celsiusToFahrenheit(value: number) {
  return Math.round((value * 9) / 5 + 32);
}

function fahrenheitToCelsius(value: number) {
  return Math.round(((value - 32) * 5) / 9);
}

export function roundNumber(value: number | null | undefined, unit: "celsius" | "fahrenheit") {
  // Keep celsius decimal precision, but normalize fahrenheit to whole numbers for display.
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return unit === "celsius" ? value : Math.round(value);
}

export function roundTemperatureForDisplay(
  value: number | null,
  fromUnit: "C" | "F" | "celsius" | "fahrenheit",
  preferredUnit: TemperatureUnit,
) {
  // Convert source temperature into the requested unit and round for UI display.
  if (value === null || value === undefined) return 0;
  const celsius = fromUnit.toLowerCase().startsWith("c")
    ? value
    : ((value - 32) * 5) / 9;
  return preferredUnit === "celsius"
    ? Math.round(celsius)
    : celsiusToFahrenheit(celsius);
}

export function convertPressureToHPa(
  value: number | null,
  unitCode?: string | null,
) {
  // Normalize varying pressure units from NWS into hPa for consistent output.
  if (value === null || value === undefined) return null;
  const unit = (unitCode || "").toLowerCase();
  if (unit.includes("pa")) return value / 100;
  if (unit.includes("inhg") || unit.includes("in_hg")) return value * 33.8639;
  return value;
}

function toMpsValue(maybeValue: number | null, unitCode?: string | null) {
  if (maybeValue === null || maybeValue === undefined) return null;
  const unit = (unitCode || "").toLowerCase();
  if (unit.includes("kph") || unit.includes("km_h-1") || unit.includes("km/h"))
    return maybeValue / 3.6;
  if (unit.includes("mph") || unit.includes("mi_h-1")) return maybeValue / 2.23694;
  return maybeValue;
}

export function convertWindSpeed(value: number, unitCode: string | null, preferredUnit: TemperatureUnit) {
  // Convert station wind speed values into mph or km/h based on selected unit system.
  const mps = toMpsValue(value, unitCode);
  if (mps === null) return 0;
  if (preferredUnit === "celsius") return mps * 3.6;
  return mps * 2.23694;
}

export function parseForecastWindSpeed(value: string, preferredUnit: TemperatureUnit) {
  // Parse NWS text wind speeds (including ranges) and convert into requested unit.
  const matches = value.match(/[-+]?\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;
  const numbers = matches.map((entry) => Number.parseFloat(entry)).filter((n) => !Number.isNaN(n));
  if (numbers.length === 0) return 0;
  const average = numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
  const lowered = value.toLowerCase();
  if (lowered.includes("km/h") || lowered.includes("kmh")) {
    return preferredUnit === "celsius" ? average : average / 1.60934;
  }
  if (lowered.includes("kt")) {
    const mph = average * 1.15078;
    return preferredUnit === "celsius" ? mph * 1.60934 : mph;
  }
  if (lowered.includes("m/s") || lowered.includes("mps")) {
    return preferredUnit === "celsius" ? average * 3.6 : average * 2.23694;
  }
  return preferredUnit === "celsius" ? average * 1.60934 : average;
}

export function weatherCodeFromDescription(text: string | null | undefined) {
  // Map forecast description text to app weather codes used by the UI.
  if (!text) return 0;
  const value = text.toLowerCase();

  if (
    value.includes("thunder") ||
    value.includes("t-storm") ||
    value.includes("thunderstorm")
  ) {
    if (value.includes("hail")) return 96;
    return 95;
  }
  if (
    value.includes("heavy freezing") ||
    value.includes("freezing rain") ||
    value.includes("freezing drizzle")
  ) {
    return 66;
  }
  if (value.includes("rain")) {
    if (value.includes("heavy")) return 65;
    if (value.includes("moderate")) return 63;
    if (value.includes("slight")) return 61;
    return 63;
  }
  if (value.includes("drizzle")) return 51;
  if (value.includes("sleet")) return 67;
  if (value.includes("snow")) {
    if (value.includes("heavy")) return 75;
    if (value.includes("moderate")) return 73;
    if (value.includes("slight") || value.includes("flurr")) return 71;
    return 71;
  }
  if (value.includes("fog") || value.includes("haze")) return 45;
  if (value.includes("overcast")) return 3;
  if (value.includes("partly") || value.includes("mostly cloudy")) return 2;
  if (value.includes("mostly sunny") || value.includes("mostly clear")) return 1;
  if (value.includes("sunny") || value.includes("clear")) return 0;
  return 0;
}

function toDateOnly(value: string) {
  return value.split("T")[0];
}

function toDateOnlyForZone(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toDateOnly(value);
  if (!timeZone) return toDateOnly(value);

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    return toDateOnly(value);
  }

  return toDateOnly(value);
}

function toTodayDateForZone(referenceDate: Date, timeZone?: string) {
  if (!timeZone) return toDateOnly(referenceDate.toISOString());
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(referenceDate);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    return toDateOnly(referenceDate.toISOString());
  }
  return toDateOnly(referenceDate.toISOString());
}

export function findPeriodAtOrClosestToNow(
  periods: ForecastPeriod[] = [],
  now: Date = new Date(),
) {
  // Prefer the active period covering "now"; otherwise pick the nearest period start time.
  if (!periods.length) return undefined;
  const nowMs = now.getTime();
  let active = periods.find((period) => {
    const start = Date.parse(period.startTime);
    const end = period.endTime ? Date.parse(period.endTime) : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return start <= nowMs && nowMs <= end;
  });
  if (active) return active;

  let closest = periods[0];
  let smallestDelta = Number.POSITIVE_INFINITY;
  for (const period of periods) {
    const start = Date.parse(period.startTime);
    if (!Number.isFinite(start)) continue;
    const delta = Math.abs(start - nowMs);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = period;
    }
  }
  return closest;
}

function convertPrecipitationValue(value: number, unitCode: string, unit: TemperatureUnit) {
  const normalized = unitCode.toLowerCase();
  if (
    normalized.includes("mm") ||
    normalized.includes("wmoUnit:mm") ||
    normalized.includes("unit:mm")
  ) {
    return unit === "celsius" ? value : value / 25.4;
  }
  if (
    normalized.includes("m") &&
    !normalized.includes("mm") &&
    !normalized.includes("mi")
  ) {
    const millimeters = value * 1000;
    return unit === "celsius" ? millimeters : millimeters / 25.4;
  }
  if (normalized.includes("in")) {
    return unit === "celsius" ? value * 25.4 : value;
  }
  return unit === "celsius" ? value : value / 25.4;
}

function normalizePrecipitationUnit(unitCode: string, unit: TemperatureUnit) {
  const normalized = unitCode.toLowerCase();
  if (normalized.includes("in")) return unit === "celsius" ? "mm" : "in";
  if (normalized.includes("mm")) return unit === "celsius" ? "mm" : "in";
  if (normalized.includes("m")) return unit === "celsius" ? "mm" : "in";
  return unit === "celsius" ? "mm" : "in";
}

export function buildDailyPrecipitationTotals(
  values: GridForecastValue[] | undefined,
  unitCode: string,
  preferredUnit: TemperatureUnit,
) {
  // Aggregate grid precipitation values into day buckets and normalize units for response output.
  const precipitationByDate: Record<string, number> = {};
  const safeValues = Array.isArray(values) ? values : [];
  for (const entry of safeValues) {
    if (entry.value === null || entry.value === undefined || Number.isNaN(entry.value)) continue;
    const validTime = entry.validTime || "";
    const [startTime] = validTime.split("/");
    if (!startTime) continue;
    const dateKey = toDateOnly(startTime);
    const converted = convertPrecipitationValue(entry.value, unitCode, preferredUnit);
    precipitationByDate[dateKey] = (precipitationByDate[dateKey] || 0) + converted;
  }

  return {
    precipitationByDate,
    unit: normalizePrecipitationUnit(unitCode, preferredUnit),
  };
}

function buildDailyOutlookEntries(
  periods: ForecastPeriod[],
  unit: TemperatureUnit,
  precipitationByDate: Record<string, number>,
  precipitationChanceByDate: Record<string, number>,
  timeZone?: string,
) {
  const grouped = new Map<
    string,
    {
      day?: ForecastPeriod;
      night?: ForecastPeriod;
      any?: ForecastPeriod;
    }
  >();

  for (const period of periods) {
    const key = toDateOnlyForZone(period.startTime, timeZone);
    const existing = grouped.get(key) || {};
    existing.any = existing.any || period;
    if (period.isDaytime) existing.day = period;
    else existing.night = period;
    grouped.set(key, existing);
  }

  const sortedDates = Array.from(grouped.keys()).sort();
  return sortedDates.map((date): DailyOutlookEntry => {
    const bucket = grouped.get(date) || {};
    const daySource = bucket.day || bucket.any || bucket.night;
    const nightSource = bucket.night || bucket.any || bucket.day;
    const maxSource = daySource?.temperature ?? bucket.any?.temperature ?? 0;
    const minSource = nightSource?.temperature ?? bucket.any?.temperature ?? 0;
    const temperatureMax = roundTemperatureForDisplay(maxSource, "F", unit);
    const temperatureMin = roundTemperatureForDisplay(minSource, "F", unit);
    const weatherSource = daySource || nightSource || bucket.any;
    const precipitation = precipitationByDate[date] || 0;
    const precipitationChance = precipitationChanceByDate[date];
    return {
      date,
      weatherCode: weatherCodeFromDescription(weatherSource?.shortForecast),
      temperatureMax,
      temperatureMin,
      precipitation: roundNumber(precipitation, unit),
      precipitationChance:
        typeof precipitationChance === "number" ? roundNumber(precipitationChance, "fahrenheit") : undefined,
    };
  });
}

export function createFiveDayOutlook(
  periods: ForecastPeriod[],
  unit: TemperatureUnit,
  precipitationByDate: Record<string, number>,
  precipitationChanceByDate: Record<string, number>,
  timeZone?: string,
) {
  // Build the forward-looking 5-day array beginning after today.
  const entries = buildDailyOutlookEntries(
    periods,
    unit,
    precipitationByDate,
    precipitationChanceByDate,
    timeZone,
  );
  const today = toTodayDateForZone(new Date(), timeZone);
  return entries.filter((entry) => entry.date > today).slice(0, 5);
}

export function createTodayOutlook(
  periods: ForecastPeriod[],
  unit: TemperatureUnit,
  precipitationByDate: Record<string, number>,
  precipitationChanceByDate: Record<string, number>,
  timeZone?: string,
) {
  // Resolve today's summary (or fall back to first available entry if needed).
  const entries = buildDailyOutlookEntries(
    periods,
    unit,
    precipitationByDate,
    precipitationChanceByDate,
    timeZone,
  );
  const today = toTodayDateForZone(new Date(), timeZone);
  return entries.find((entry) => entry.date === today) || entries[0];
}

export function buildDailyPrecipitationChanceByDate(
  periods: ForecastPeriod[],
  timeZone?: string,
) {
  // Keep the maximum precipitation chance reported for each date.
  const chances: Record<string, number> = {};
  for (const period of periods) {
    const value = period.probabilityOfPrecipitation?.value;
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    const dateKey = toDateOnlyForZone(period.startTime, timeZone);
    chances[dateKey] = Math.max(chances[dateKey] || 0, value);
  }
  return chances;
}

export function weatherDirectionFromText(directionText?: string | null) {
  // Convert cardinal direction strings (e.g., NW) to degrees for UI gauge display.
  if (!directionText) return null;
  const normalized = directionText.toLowerCase();
  const map: Record<string, number> = {
    n: 0,
    nne: 22.5,
    ne: 45,
    ene: 67.5,
    e: 90,
    ese: 112.5,
    se: 135,
    sse: 157.5,
    s: 180,
    ssw: 202.5,
    sw: 225,
    wsw: 247.5,
    w: 270,
    wnw: 292.5,
    nw: 315,
    nnw: 337.5,
  };
  return map[normalized] ?? null;
}
