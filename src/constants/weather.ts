export const NWS_HEADERS = {
  "User-Agent": "LockIn Weather App (contact: developer@example.com)",
  Accept: "application/geo+json",
};

import { API_URLS } from "@/config/api-urls";

export const NWS_API_BASE = API_URLS.nws.base;
export const CENSUS_GEOCODER_URL = API_URLS.census.geocoder.onelineAddress;
export const CENSUS_ADDRESS_GEOCODER_URL = API_URLS.census.geocoder.address;
export const CENSUS_HEADERS = {
  "User-Agent": "LockIn Weather App (contact: developer@example.com)",
  Accept: "application/json",
};

export const NOMINATIM_GEOCODER_URL = API_URLS.nominatim.search;
export const NOMINATIM_HEADERS = {
  "User-Agent": "LockInWeatherApp/1.0 (contact: developer@example.com)",
  Accept: "application/json",
};

export const OPEN_METEO_GEOCODER_URL = API_URLS.openMeteo.geocodeSearch;

export const STATE_NAME_TO_CODE: Record<string, string> = {
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

export const STATE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [code, name]),
);
