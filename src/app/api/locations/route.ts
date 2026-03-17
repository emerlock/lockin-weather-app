import { NextRequest, NextResponse } from "next/server";
import type { LocationSuggestion } from "@/types/weather";
import {
  CENSUS_ADDRESS_GEOCODER_URL,
  CENSUS_GEOCODER_URL,
  CENSUS_HEADERS,
  NOMINATIM_GEOCODER_URL,
  NOMINATIM_HEADERS,
  OPEN_METEO_GEOCODER_URL,
  STATE_CODE_TO_NAME,
  STATE_NAME_TO_CODE,
} from "@/constants/weather";

const LOCATION_SUGGESTION_CACHE_TTL_MS = 90 * 1000;
const LOCATION_SEARCH_LIMIT = 8;
const OPEN_METEO_SEARCH_LIMIT = 8;
const LOCATION_RESPONSE_LIMIT = 10;
const MIN_LOCATION_QUERY_LENGTH = 2;
const LOCATION_LOOKUP_IN_FLIGHT_TTL_MS = 5 * 1000;

const locationSuggestionInFlight = new Map<
  string,
  { expiresAt: number; promise: Promise<LocationSuggestion[]> }
>();

const locationSuggestionCache = new Map<
  string,
  { expiresAt: number; data: LocationSuggestion[] }
>();

interface CensusAddressComponents {
  city?: string;
  state?: string;
  stateName?: string;
  stateAbbreviation?: string;
}

interface CensusAddressMatch {
  matchedAddress?: string;
  addressComponents?: CensusAddressComponents;
}

interface CensusGeocodeResponse {
  result?: {
    addressMatches?: CensusAddressMatch[];
  };
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  county?: string;
  state_district?: string;
  state?: string;
  state_code?: string;
}

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: NominatimAddress;
  type?: string;
}

interface OpenMeteoGeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country_code?: string;
}

interface OpenMeteoSearchResponse {
  results?: OpenMeteoGeocodeResult[];
}

interface NominatimResolvedState {
  code: string;
  name: string;
}

function stateNameFromCensusComponents(
  components?: CensusAddressComponents,
) {
  const stateAbbr =
    components?.stateAbbreviation?.trim().toUpperCase() ||
    components?.state?.trim().toUpperCase() ||
    null;
  if (stateAbbr && STATE_CODE_TO_NAME[stateAbbr]) {
    return STATE_CODE_TO_NAME[stateAbbr];
  }

  const normalized = components?.stateName?.trim().toLowerCase();
  if (normalized) {
    const code = STATE_NAME_TO_CODE[normalized];
    if (code) return STATE_CODE_TO_NAME[code] || normalized;
  }

  return null;
}

function stateNameFromAddressText(addressText?: string) {
  if (!addressText) return null;
  const parts = addressText
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const statePortion = parts[parts.length - 2];
  const stateToken = statePortion.split(" ").filter(Boolean)[0];
  const upper = stateToken?.toUpperCase();
  if (upper && STATE_CODE_TO_NAME[upper]) return STATE_CODE_TO_NAME[upper];
  const code = STATE_NAME_TO_CODE[statePortion.toLowerCase()];
  if (code) return STATE_CODE_TO_NAME[code];
  return null;
}

function normalizeLocationText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLocationQuery(value: string) {
  const text = normalizeLocationText(value);
  const [left = "", right] = text.split(",", 2);
  if (right && right.trim()) {
    return {
      cityPart: left.trim(),
      statePart: right.trim(),
      cityTokens: left
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean),
      stateTokens: right
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean),
      isStateAware: true,
    };
  }

  return {
    cityPart: text,
    statePart: "",
    cityTokens: text.split(" ").map((token) => token.trim()).filter(Boolean),
    stateTokens: [],
    isStateAware: false,
  };
}

function splitCityStateQuery(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    city: parts.length > 0 ? parts[0] : value.trim(),
    state: parts.length > 1 ? parts[1] : "",
  };
}

function buildSearchVariants(value: string) {
  const text = value.trim();
  const variants = new Set<string>();
  if (!text) return [];

  variants.add(text);
  const [cityPartRaw = "", statePartRaw = ""] = text.split(",", 2);
  const cityPart = cityPartRaw.trim();
  const statePart = statePartRaw.trim();

  if (cityPart) variants.add(cityPart);
  if (cityPart && statePart) {
    variants.add(`${cityPart} ${statePart}`);
    variants.add(`${cityPart},${statePart}`);
    variants.add(`${cityPart} ${statePart.replace(/\s+/g, " ")}`);
  }

  return Array.from(variants).map((entry) => entry.trim()).filter(Boolean);
}

async function fetchCensusMatches(address: string) {
  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    format: "json",
  });

  const response = await fetch(
    `${CENSUS_GEOCODER_URL}?${params.toString()}`,
    { next: { revalidate: 60 * 30 }, headers: CENSUS_HEADERS },
  );

  if (!response.ok) return null;
  return (await response.json()) as CensusGeocodeResponse;
}

async function fetchCensusAddressMatches(city: string, state: string) {
  const params = new URLSearchParams({
    city,
    benchmark: "Public_AR_Current",
    format: "json",
  });
  if (state) params.set("state", state);

  const response = await fetch(
    `${CENSUS_ADDRESS_GEOCODER_URL}?${params.toString()}`,
    { next: { revalidate: 60 * 30 }, headers: CENSUS_HEADERS },
  );

  if (!response.ok) return null;
  return (await response.json()) as CensusGeocodeResponse;
}

function cityFromNominatim(address: NominatimAddress | undefined, name?: string) {
  return (
    address?.city?.trim() ||
    address?.town?.trim() ||
    address?.village?.trim() ||
    address?.municipality?.trim() ||
    address?.hamlet?.trim() ||
    address?.county?.trim() ||
    address?.state_district?.trim() ||
    name?.trim() ||
    ""
  );
}

function resolveNominatimState(address: NominatimAddress | undefined) {
  if (!address) return null;

  const bracketedCode = address.state_code?.trim().toUpperCase();
  const cleanCode = bracketedCode?.replace(/^US-/, "");
  if (cleanCode && STATE_CODE_TO_NAME[cleanCode]) {
    return {
      code: cleanCode,
      name: STATE_CODE_TO_NAME[cleanCode],
    };
  }

  const fullState = address.state?.trim().toLowerCase();
  const code = fullState ? STATE_NAME_TO_CODE[fullState] : null;
  if (code) {
    return {
      code,
      name: STATE_CODE_TO_NAME[code],
    };
  }

  if (fullState) {
    return {
      code: fullState.toUpperCase().slice(0, 2),
      name: fullState,
    };
  }

  return null;
}

async function fetchNominatimMatches(query: string) {
  const params = new URLSearchParams({
    q: query,
    countrycodes: "us",
    format: "json",
    addressdetails: "1",
    limit: LOCATION_SEARCH_LIMIT.toString(),
  });

  const response = await fetch(`${NOMINATIM_GEOCODER_URL}?${params.toString()}`, {
    next: { revalidate: 60 * 30 },
    headers: NOMINATIM_HEADERS,
  });

  if (!response.ok) return null;
  return (await response.json()) as NominatimSearchResult[];
}

async function fetchOpenMeteoMatches(query: string) {
  const params = new URLSearchParams({
    name: query,
    count: OPEN_METEO_SEARCH_LIMIT.toString(),
    language: "en",
    countryCode: "US",
    format: "json",
  });

  const response = await fetch(
    `${OPEN_METEO_GEOCODER_URL}?${params.toString()}`,
    { next: { revalidate: 60 * 30 } },
  );

  if (!response.ok) return null;
  return (await response.json()) as OpenMeteoSearchResponse;
}

function levenshteinDistance(left: string, right: string) {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );

  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitutionCost,
      );
    }
  }

  return matrix[left.length][right.length];
}

function similarity(left: string, right: string) {
  const normalizedLeft = normalizeLocationText(left);
  const normalizedRight = normalizeLocationText(right);
  if (!normalizedLeft && !normalizedRight) return 1;
  if (!normalizedLeft || !normalizedRight) return 0;
  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  return 1 - distance / Math.max(normalizedLeft.length, normalizedRight.length);
}

function scoreLocationMatch(
  city: string,
  state: string,
  cityQuery: string,
  stateQuery: string,
  queryStateAware: boolean,
) {
  const normalizedCity = normalizeLocationText(city);
  const normalizedState = normalizeLocationText(state);
  const normalizedCityQuery = normalizeLocationText(cityQuery);

  let cityScore = normalizedCity.startsWith(normalizedCityQuery)
    ? 1
    : similarity(normalizedCity, normalizedCityQuery);

  const queryCityTokens = cityQuery
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  const candidateCityTokens = normalizedCity.split(" ");
  if (queryCityTokens.length > 0) {
    const tokenMatches = queryCityTokens.filter(
      (token) => candidateCityTokens.some((candidate) => candidate.startsWith(token)),
    ).length;
    cityScore = Math.max(cityScore, tokenMatches / queryCityTokens.length);
  }

  if (!queryStateAware) return cityScore;

  const normalizedStateQuery = normalizeLocationText(stateQuery);
  let stateScore = 0;
  if (normalizedState === normalizedStateQuery) {
    stateScore = 1;
  } else if (normalizedState.startsWith(normalizedStateQuery)) {
    stateScore = 0.85;
  } else {
    stateScore = similarity(normalizedState, normalizedStateQuery);
  }

  return cityScore * 0.75 + stateScore * 0.25;
}

function isLikelyCityMatch(candidateCity: string, cityQuery: string) {
  const normalizedCandidateCity = normalizeLocationText(candidateCity);
  const normalizedQueryCity = normalizeLocationText(cityQuery);
  if (!normalizedCandidateCity || !normalizedQueryCity) return true;

  if (
    normalizedCandidateCity === normalizedQueryCity ||
    normalizedCandidateCity.includes(normalizedQueryCity) ||
    normalizedQueryCity.includes(normalizedCandidateCity)
  ) {
    return true;
  }

  const candidateTokens = normalizedCandidateCity
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  const queryTokens = normalizedQueryCity
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return false;

  const tokenMatchCount = queryTokens.filter((token) =>
    candidateTokens.some(
      (candidateToken) =>
        candidateToken === token ||
        candidateToken.startsWith(token) ||
        token.startsWith(candidateToken),
    ),
  ).length;

  return tokenMatchCount / queryTokens.length >= 0.75;
}

function toSuggestionCacheKey(value: string) {
  return value.trim().toLowerCase();
}

function getCachedSuggestions(query: string) {
  const key = toSuggestionCacheKey(query);
  const entry = locationSuggestionCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    locationSuggestionCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedSuggestions(query: string, data: LocationSuggestion[]) {
  const key = toSuggestionCacheKey(query);
  locationSuggestionCache.set(key, {
    expiresAt: Date.now() + LOCATION_SUGGESTION_CACHE_TTL_MS,
    data,
  });
}

function pruneSuggestionCache() {
  const now = Date.now();
  for (const [key, entry] of locationSuggestionCache.entries()) {
    if (entry.expiresAt < now) {
      locationSuggestionCache.delete(key);
    }
  }
}

function respondWithCachedSuggestions(
  query: string,
  data: Array<Pick<LocationSuggestion, "city" | "state" | "label">>,
) {
  const trimmed = data.slice(0, LOCATION_RESPONSE_LIMIT);
  setCachedSuggestions(query, trimmed);
  return trimmed;
}

function getInFlightSuggestions(query: string) {
  const key = toSuggestionCacheKey(query);
  const entry = locationSuggestionInFlight.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    locationSuggestionInFlight.delete(key);
    return null;
  }
  return entry.promise;
}

function setInFlightSuggestions(query: string, promise: Promise<LocationSuggestion[]>) {
  const key = toSuggestionCacheKey(query);
  locationSuggestionInFlight.set(key, {
    expiresAt: Date.now() + LOCATION_LOOKUP_IN_FLIGHT_TTL_MS,
    promise,
  });
}

function clearInFlightSuggestions(query: string) {
  const key = toSuggestionCacheKey(query);
  locationSuggestionInFlight.delete(key);
}

async function getLocationSuggestions(query: string) {
  const queryInfo = parseLocationQuery(query);
  const searchVariants = buildSearchVariants(query);
  let payload: CensusGeocodeResponse | null = null;

  for (const variant of searchVariants) {
    const matchPayload = await fetchCensusMatches(variant);
    if (
      matchPayload?.result?.addressMatches &&
      matchPayload.result.addressMatches.length > 0
    ) {
      payload = matchPayload;
      break;
    }
  }

  if (!payload) {
    const parsed = splitCityStateQuery(query);
    if (parsed.city) {
      const addressPayload = await fetchCensusAddressMatches(
        parsed.city,
        parsed.state,
      );
      if (
        addressPayload?.result?.addressMatches &&
        addressPayload.result.addressMatches.length > 0
      ) {
        payload = addressPayload;
      }
    }
  }

  if (!payload) {
    const nominatim = await fetchNominatimMatches(query);
    if (!nominatim || nominatim.length === 0) {
      let openMeteoData: Array<LocationSuggestion & { score: number }> = [];
      let openMeteoFound = false;
      const queryStateToken = queryInfo.statePart.trim().toLowerCase();
      const queryStateCode = queryStateToken
        ? STATE_NAME_TO_CODE[queryStateToken] ||
          (STATE_CODE_TO_NAME[queryStateToken.toUpperCase()]
            ? queryStateToken.toUpperCase()
            : null)
        : null;
      const queryStateName = queryStateCode
        ? STATE_CODE_TO_NAME[queryStateCode]
        : null;

      for (const variant of searchVariants) {
        const openMeteo = await fetchOpenMeteoMatches(variant);
        if (!openMeteo?.results || openMeteo.results.length === 0) continue;

        for (const entry of openMeteo.results) {
          const stateName = entry.admin1?.trim() || null;
          const stateCode = stateName
            ? STATE_NAME_TO_CODE[stateName.toLowerCase()] ||
              (STATE_CODE_TO_NAME[stateName.toUpperCase()]
                ? stateName.toUpperCase()
                : null)
            : null;
          if (!entry.name || !stateName || !stateCode) continue;

          if (queryInfo.isStateAware && queryInfo.statePart) {
            const candidateStateCode =
              STATE_NAME_TO_CODE[stateName.toLowerCase()] || stateName.toUpperCase();
            const expectedStateCode = queryStateCode || queryStateName || "";
            const expectedStateLower = expectedStateCode.toLowerCase();
            const candidateMatch =
              candidateStateCode.toLowerCase() === expectedStateLower ||
              stateName.toLowerCase() === expectedStateLower;
            if (!candidateMatch) continue;
          }

          if (!isLikelyCityMatch(entry.name, queryInfo.cityPart)) continue;

          openMeteoData.push({
            city: entry.name,
            state: stateName,
            label: `${entry.name}, ${stateName}`,
            score: scoreLocationMatch(
              entry.name,
              stateName,
              queryInfo.cityPart,
              queryInfo.statePart,
              queryInfo.isStateAware,
            ),
          });
        }

        if (openMeteoData.length > 0) {
          openMeteoFound = true;
          break;
        }
      }

      if (!openMeteoFound) {
        const emptyResult: LocationSuggestion[] = [];
        setCachedSuggestions(query, emptyResult);
        return emptyResult;
      }

      const openTopData = openMeteoData
        .sort((a, b) => b.score - a.score || a.city.localeCompare(b.city))
        .slice(0, LOCATION_RESPONSE_LIMIT)
        .map(({ city, state, label }) => ({ city, state, label }));

      return respondWithCachedSuggestions(query, openTopData);
    }

    const nominatimData: Array<LocationSuggestion & { score: number }> = [];
    for (const entry of nominatim) {
      const city = cityFromNominatim(entry.address, entry.name);
      const resolvedState = resolveNominatimState(entry.address);
      const stateName = resolvedState?.name;
      if (!city || !stateName) continue;

      const lat = Number.parseFloat(entry.lat);
      const lon = Number.parseFloat(entry.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!isLikelyCityMatch(city, queryInfo.cityPart)) continue;
      const score = scoreLocationMatch(
        city,
        stateName,
        queryInfo.cityPart,
        queryInfo.statePart,
        queryInfo.isStateAware,
      );
      nominatimData.push({
        city,
        state: stateName,
        label: `${city}, ${stateName}`,
        score,
      });
    }

    const topData = nominatimData
      .sort((a, b) => b.score - a.score || a.city.localeCompare(b.city))
      .slice(0, LOCATION_RESPONSE_LIMIT)
      .map(({ city, state, label }) => ({ city, state, label }));

    return respondWithCachedSuggestions(query, topData);
  }

  if (!payload.result?.addressMatches || payload.result.addressMatches.length === 0) {
    const emptyResult: LocationSuggestion[] = [];
    setCachedSuggestions(query, emptyResult);
    return emptyResult;
  }

  const unique = new Set<string>();
  const data: Array<LocationSuggestion & { score: number }> = [];

  for (const entry of payload.result?.addressMatches || []) {
    const city =
      entry.addressComponents?.city?.trim() ||
      entry.matchedAddress?.split(",")[0]?.trim() ||
      "";
    const stateName =
      stateNameFromCensusComponents(entry.addressComponents) ||
      stateNameFromAddressText(entry.matchedAddress || "");
    if (!city || !stateName) continue;
    const key = `${city}|${stateName}`.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    const score = scoreLocationMatch(
      city,
      stateName,
      queryInfo.cityPart,
      queryInfo.statePart,
      queryInfo.isStateAware,
    );
    data.push({
      city,
      state: stateName,
      label: `${city}, ${stateName}`,
      score,
    });
  }

  const topData = data
    .sort((a, b) => b.score - a.score || a.city.localeCompare(b.city))
    .slice(0, LOCATION_RESPONSE_LIMIT)
    .map(({ city, state, label }) => ({ city, state, label }));

  return respondWithCachedSuggestions(query, topData);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < MIN_LOCATION_QUERY_LENGTH) {
    return NextResponse.json({ data: [] as LocationSuggestion[] });
  }

  try {
    pruneSuggestionCache();
    const cached = getCachedSuggestions(query);
    if (cached) {
      return NextResponse.json({ data: cached });
    }

    const inFlight = getInFlightSuggestions(query);
    if (inFlight) {
      const data = await inFlight;
      return NextResponse.json({ data });
    }

    const lookupPromise = getLocationSuggestions(query);
    setInFlightSuggestions(query, lookupPromise);
    try {
      const data = await lookupPromise;
      return NextResponse.json({ data });
    } finally {
      clearInFlightSuggestions(query);
    }
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while fetching location suggestions" },
      { status: 500 },
    );
  }
}
