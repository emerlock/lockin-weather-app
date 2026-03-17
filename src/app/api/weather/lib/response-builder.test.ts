import { describe, expect, it } from "vitest";
import { buildWeatherResponse } from "./response-builder";

function makeDate(daysOffset: number, hourUtc: number) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + daysOffset);
  base.setUTCHours(hourUtc, 0, 0, 0);
  return base.toISOString();
}

describe("buildWeatherResponse", () => {
  it("uses forecast fallback values when observation is missing", () => {
    const now = new Date();
    const activeStart = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const activeEnd = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    const response = buildWeatherResponse({
      activeAlerts: [],
      currentObservation: {},
      hourlyPeriods: [
        {
          startTime: activeStart,
          endTime: activeEnd,
          temperature: 41,
          temperatureUnit: "F",
          windSpeed: "12 mph",
          windDirection: "NW",
          windDirectionCardinal: "NW",
          shortForecast: "Sunny",
          icon: "",
          isDaytime: true,
          probabilityOfPrecipitation: { value: 20 },
        },
      ],
      location: {
        city: "Abingdon",
        admin1: "MD",
        latitude: 39.46,
        longitude: -76.27,
      },
      periods: [
        {
          startTime: makeDate(0, 12),
          endTime: makeDate(0, 18),
          temperature: 42,
          temperatureUnit: "F",
          windSpeed: "10 mph",
          windDirection: "NW",
          shortForecast: "Partly Cloudy",
          icon: "",
          isDaytime: true,
          probabilityOfPrecipitation: { value: 30 },
        },
        {
          startTime: makeDate(0, 23),
          endTime: makeDate(1, 5),
          temperature: 24,
          temperatureUnit: "F",
          windSpeed: "7 mph",
          windDirection: "N",
          shortForecast: "Clear",
          icon: "",
          isDaytime: false,
          probabilityOfPrecipitation: { value: 10 },
        },
        {
          startTime: makeDate(1, 12),
          endTime: makeDate(1, 18),
          temperature: 45,
          temperatureUnit: "F",
          windSpeed: "9 mph",
          windDirection: "W",
          shortForecast: "Cloudy",
          icon: "",
          isDaytime: true,
          probabilityOfPrecipitation: { value: 40 },
        },
      ],
      pointsData: {
        properties: {
          forecast: "https://example.com/forecast",
          observationStations: "https://example.com/stations",
          relativeLocation: {
            properties: {
              city: "Abingdon",
              state: "MD",
            },
          },
        },
      },
      precipitationByDate: {
        [makeDate(0, 12).split("T")[0]]: 0.2,
      },
      precipitationChanceByDate: {
        [makeDate(0, 12).split("T")[0]]: 30,
        [makeDate(1, 12).split("T")[0]]: 40,
      },
      precipitationUnit: "in",
      unit: "fahrenheit",
    });

    expect(response.data.temperature).toBe(41);
    expect(response.data.windSpeed).toBe(12);
    expect(response.data.windDirection).toBe(315);
    expect(response.data.forecastTodayMax).toBe(42);
    expect(response.data.forecastTodayMin).toBe(24);
    expect(response.data.dailyPrecipitationUnit).toBe("in");
    expect(response.data.dailyOutlook.length).toBeGreaterThan(0);
  });

  it("prefers current observation over forecast fallback", () => {
    const response = buildWeatherResponse({
      activeAlerts: [],
      currentObservation: {
        temperature: 33,
        windSpeed: 5.1,
        windDirection: 180,
        humidity: 54.6,
        surfacePressure: 1008.8,
        description: "Heavy rain",
      },
      hourlyPeriods: [],
      location: {
        city: "Abingdon",
        admin1: "MD",
        latitude: 39.46,
        longitude: -76.27,
      },
      periods: [
        {
          startTime: makeDate(0, 12),
          endTime: makeDate(0, 18),
          temperature: 42,
          temperatureUnit: "F",
          windSpeed: "10 mph",
          windDirection: "NW",
          shortForecast: "Partly Cloudy",
          icon: "",
          isDaytime: true,
          probabilityOfPrecipitation: { value: 30 },
        },
      ],
      pointsData: {
        properties: {
          forecast: "https://example.com/forecast",
          observationStations: "https://example.com/stations",
          relativeLocation: {
            properties: {
              city: "Abingdon",
              state: "MD",
            },
          },
        },
      },
      precipitationByDate: {},
      precipitationChanceByDate: {},
      precipitationUnit: "in",
      unit: "fahrenheit",
    });

    expect(response.data.temperature).toBe(33);
    expect(response.data.windSpeed).toBe(5);
    expect(response.data.windDirection).toBe(180);
    expect(response.data.humidity).toBe(55);
    expect(response.data.surfacePressure).toBe(1009);
    expect(response.data.weatherCode).toBe(65);
  });
});
