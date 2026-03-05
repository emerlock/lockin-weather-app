"use client";

import { create } from "zustand";
import type { TemperatureUnit } from "@/types/weather";

interface WeatherStoreState {
  city: string;
  state: string;
  unit: TemperatureUnit;
  setLocation: (city: string, state: string) => void;
  toggleUnit: () => void;
}

export const useWeatherStore = create<WeatherStoreState>((set) => ({
  city: "New York",
  state: "NY",
  unit: "fahrenheit",
  setLocation: (city, state) => set({ city, state }),
  toggleUnit: () =>
    set((state) => ({
      unit: state.unit === "fahrenheit" ? "celsius" : "fahrenheit",
    })),
}));
