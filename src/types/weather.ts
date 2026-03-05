export type TemperatureUnit = "celsius" | "fahrenheit";

export interface DailyOutlook {
  date: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
}

export interface WeatherData {
  city: string;
  state: string | null;
  latitude: number;
  longitude: number;
  temperature: number;
  windSpeed: number;
  windDirection: number;
  humidity: number;
  surfacePressure: number;
  weatherCode: number;
  airQualityIndex: number | null;
  airQualityCategory: string | null;
  airQualityUnit: string;
  dailyPrecipitation: number;
  dailyPrecipitationUnit: string;
  windSpeedUnit: string;
  windDirectionUnit: string;
  humidityUnit: string;
  surfacePressureUnit: string;
  dailyOutlook: DailyOutlook[];
  unit: TemperatureUnit;
  fetchedAt: string;
}

export interface WeatherApiResponse {
  data: WeatherData;
}

export interface LocationSuggestion {
  city: string;
  state: string;
  label: string;
}
