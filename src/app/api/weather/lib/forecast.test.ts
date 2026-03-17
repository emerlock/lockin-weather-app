import { describe, expect, it } from "vitest";
import {
  buildDailyPrecipitationChanceByDate,
  buildDailyPrecipitationTotals,
  roundTemperatureForDisplay,
  weatherDirectionFromText,
} from "./forecast";

describe("forecast utils", () => {
  it("converts temperature for display across units", () => {
    expect(roundTemperatureForDisplay(20, "C", "fahrenheit")).toBe(68);
    expect(roundTemperatureForDisplay(68, "F", "celsius")).toBe(20);
  });

  it("builds daily precipitation totals and converts units", () => {
    const totals = buildDailyPrecipitationTotals(
      [
        { validTime: "2026-03-17T00:00:00+00:00/PT6H", value: 2 },
        { validTime: "2026-03-17T06:00:00+00:00/PT6H", value: 3 },
        { validTime: "2026-03-18T00:00:00+00:00/PT6H", value: null },
      ],
      "wmoUnit:mm",
      "fahrenheit",
    );

    expect(totals.unit).toBe("in");
    expect(totals.precipitationByDate["2026-03-17"]).toBeCloseTo(5 / 25.4, 6);
    expect(totals.precipitationByDate["2026-03-18"]).toBeUndefined();
  });

  it("builds daily precipitation chance with max value per day", () => {
    const chances = buildDailyPrecipitationChanceByDate(
      [
        {
          startTime: "2026-03-17T08:00:00+00:00",
          temperature: 40,
          temperatureUnit: "F",
          windSpeed: "5 mph",
          windDirection: "NW",
          shortForecast: "Cloudy",
          icon: "",
          isDaytime: true,
          probabilityOfPrecipitation: { value: 25 },
        },
        {
          startTime: "2026-03-17T20:00:00+00:00",
          temperature: 31,
          temperatureUnit: "F",
          windSpeed: "6 mph",
          windDirection: "N",
          shortForecast: "Rain",
          icon: "",
          isDaytime: false,
          probabilityOfPrecipitation: { value: 60 },
        },
        {
          startTime: "2026-03-18T08:00:00+00:00",
          temperature: 45,
          temperatureUnit: "F",
          windSpeed: "4 mph",
          windDirection: "W",
          shortForecast: "Sunny",
          icon: "",
          isDaytime: true,
          probabilityOfPrecipitation: { value: 10 },
        },
      ],
      undefined,
    );

    expect(chances["2026-03-17"]).toBe(60);
    expect(chances["2026-03-18"]).toBe(10);
  });

  it("maps cardinal direction text to degrees", () => {
    expect(weatherDirectionFromText("NW")).toBe(315);
    expect(weatherDirectionFromText("bad-value")).toBeNull();
  });
});
