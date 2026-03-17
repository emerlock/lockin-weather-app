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

interface CensusAddressComponents {
  city?: string;
  state?: string;
  stateName?: string;
  stateAbbreviation?: string;
}

interface CensusAddressMatch {
  matchedAddress?: string;
  coordinates?: {
    x?: string | number;
    y?: string | number;
  };
  addressComponents?: CensusAddressComponents;
  geographies?: {
    States?: Array<{
      NAME?: string;
      STUSAB?: string;
    }>;
  };
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
  name?: string;
  display_name: string;
  address?: NominatimAddress;
}

interface OpenMeteoGeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
}

interface OpenMeteoSearchResponse {
  results?: OpenMeteoGeocodeResult[];
}

interface NominatimResolvedState {
  code: string;
  name: string;
}

export type ResolvedLocation = {
  city: string;
  admin1: string;
  latitude: number;
  longitude: number;
  code: string;
};

export function normalizeStateInput(state: string) {
  const trimmed = state.trim();
  if (!trimmed) return { code: null as string | null, name: null as string | null };

  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && STATE_CODE_TO_NAME[upper]) {
    return {
      code: upper,
      name: STATE_CODE_TO_NAME[upper],
    };
  }

  const lower = trimmed.toLowerCase();
  const code = STATE_NAME_TO_CODE[lower] || null;
  return {
    code,
    name: lower,
  };
}

export function noLocationErrorMessage(city: string, state: string, searchName: string) {
  return state
    ? `No US location found for "${searchName}". Try full state name or 2-letter code.`
    : `No US location found for "${city}"`;
}

function stateCodeFromCensusComponents(
  components?: CensusAddressComponents,
) {
  const stateAbbr = components?.stateAbbreviation?.trim();
  if (stateAbbr && STATE_CODE_TO_NAME[stateAbbr.toUpperCase()]) {
    return stateAbbr.toUpperCase();
  }

  const stateRaw = components?.state?.trim();
  if (stateRaw && STATE_CODE_TO_NAME[stateRaw.toUpperCase()]) {
    return stateRaw.toUpperCase();
  }

  const stateName = components?.stateName?.trim();
  if (stateName) {
    const nameCode = STATE_NAME_TO_CODE[stateName.toLowerCase()];
    if (nameCode) return nameCode;
  }

  return null;
}

function stateNameFromCensusCode(code: string | null) {
  if (!code) return null;
  return STATE_CODE_TO_NAME[code] || null;
}

function parseStateFromAddressText(addressText?: string) {
  if (!addressText) return null;
  const parts = addressText
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const statePortion = parts[parts.length - 2];
  const firstToken = statePortion.split(" ").filter(Boolean)[0];
  const upper = firstToken?.toUpperCase();
  if (upper && STATE_CODE_TO_NAME[upper]) return upper;

  const byName = STATE_NAME_TO_CODE[statePortion.toLowerCase()];
  if (byName) return byName;

  return null;
}

function splitCityState(value: string) {
  const parts = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return {
    city: parts.length > 0 ? parts[0] : value.trim(),
    state: parts.length > 1 ? parts[1] : "",
  };
}

function mapCensusCandidateToLocation(candidate: CensusAddressMatch) {
  const latitudeRaw = candidate.coordinates?.y;
  const longitudeRaw = candidate.coordinates?.x;
  const latitude = typeof latitudeRaw === "string" ? Number.parseFloat(latitudeRaw) : latitudeRaw;
  const longitude = typeof longitudeRaw === "string" ? Number.parseFloat(longitudeRaw) : longitudeRaw;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const city =
    candidate.addressComponents?.city?.trim() ||
    candidate.matchedAddress?.split(",")[0]?.trim() ||
    "";
  const componentsCode = stateCodeFromCensusComponents(candidate.addressComponents);
  const geographiesCode = candidate.geographies?.States?.[0]?.STUSAB?.trim().toUpperCase();
  const addressStateCode = parseStateFromAddressText(candidate.matchedAddress);
  const stateCode =
    componentsCode ||
    (geographiesCode && STATE_CODE_TO_NAME[geographiesCode] ? geographiesCode : null) ||
    addressStateCode;
  const stateName = stateCode ? stateNameFromCensusCode(stateCode) : null;

  if (!city || !stateCode || !stateName) return null;
  if (!candidate.addressComponents && !candidate.matchedAddress) return null;

  return {
    city,
    admin1: stateName,
    latitude,
    longitude,
    code: stateCode,
  };
}

function normalizeLocationText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  }

  return Array.from(variants).map((entry) => entry.trim()).filter(Boolean);
}

async function fetchCensusMatches(address: string) {
  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    format: "json",
  });

  const response = await fetch(`${CENSUS_GEOCODER_URL}?${params.toString()}`, {
    next: { revalidate: 60 * 30 },
    headers: CENSUS_HEADERS,
  });

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

function cityFromDisplayName(displayName?: string) {
  return displayName?.split(",")[0]?.trim() || null;
}

function resolveNominatimState(address: NominatimAddress | undefined): NominatimResolvedState | null {
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

function mapNominatimToCensusAddressMatch(
  item: NominatimSearchResult,
): CensusAddressMatch | null {
  const city =
    cityFromNominatim(item.address, item.name) || cityFromDisplayName(item.display_name);
  const resolvedState = resolveNominatimState(item.address);
  if (!city || !resolvedState) return null;
  return {
    matchedAddress: item.display_name,
    coordinates: {
      x: item.lon,
      y: item.lat,
    },
    addressComponents: {
      city,
      state: resolvedState.name,
      stateAbbreviation: resolvedState.code,
      stateName: resolvedState.name,
    },
  };
}

async function fetchNominatimMatches(query: string) {
  const params = new URLSearchParams({
    q: query,
    countrycodes: "us",
    format: "json",
    addressdetails: "1",
    limit: "20",
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
    count: "15",
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

function mapOpenMeteoToCensusAddressMatch(
  entry: OpenMeteoGeocodeResult,
): CensusAddressMatch | null {
  const normalizedState = (entry.admin1 || "").trim();
  if (!entry.name || !normalizedState) return null;

  const loweredState = normalizedState.toLowerCase();
  const stateCode =
    STATE_NAME_TO_CODE[loweredState] ||
    (STATE_CODE_TO_NAME[normalizedState.toUpperCase()] ? normalizedState.toUpperCase() : null);
  if (!stateCode) return null;

  return {
    matchedAddress: `${entry.name}, ${normalizedState}`,
    coordinates: {
      x: entry.longitude,
      y: entry.latitude,
    },
    addressComponents: {
      city: entry.name,
      state: normalizedState,
      stateAbbreviation: stateCode,
      stateName: normalizedState,
    },
  };
}

function hasAddressMatches(payload: CensusGeocodeResponse | null | undefined) {
  return Boolean(payload?.result?.addressMatches && payload.result.addressMatches.length > 0);
}

function scoreCensusCandidateForQuery(
  candidateCity: string,
  candidateState: string,
  cityQueryRaw: string,
  stateQueryRaw: string,
) {
  const normalizedCandidateCity = normalizeLocationText(candidateCity);
  const normalizedCandidateState = normalizeLocationText(candidateState);
  const normalizedCityQuery = normalizeLocationText(cityQueryRaw);
  const normalizedStateQuery = normalizeLocationText(stateQueryRaw);

  let cityScore = normalizedCandidateCity.startsWith(normalizedCityQuery)
    ? 1
    : similarity(normalizedCandidateCity, normalizedCityQuery);

  const cityQueryTokens = normalizedCityQuery
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  const cityTokens = normalizedCandidateCity.split(" ");
  if (cityQueryTokens.length > 0) {
    const tokenMatchCount = cityQueryTokens.filter((token) =>
      cityTokens.some((candidateToken) => candidateToken.startsWith(token)),
    ).length;
    cityScore = Math.max(cityScore, tokenMatchCount / cityQueryTokens.length);
  }

  if (!normalizedStateQuery) return cityScore;

  let stateScore = 0;
  if (
    normalizedCandidateState === normalizedStateQuery ||
    normalizedCandidateState.startsWith(normalizedStateQuery) ||
    normalizedCandidateState.includes(normalizedStateQuery)
  ) {
    stateScore = 1;
  } else {
    stateScore = similarity(normalizedCandidateState, normalizedStateQuery);
  }

  return cityScore * 0.75 + stateScore * 0.25;
}

function isLikelyCityMatch(candidateCity: string, cityQueryRaw: string) {
  const normalizedCandidateCity = normalizeLocationText(candidateCity);
  const normalizedQueryCity = normalizeLocationText(cityQueryRaw);
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

function admin1MatchesState(admin1: string | undefined, stateInput: string) {
  if (!admin1 || !stateInput) return false;
  const normalized = normalizeStateInput(stateInput);
  const admin1Lower = admin1.toLowerCase();
  const admin1Code = STATE_NAME_TO_CODE[admin1Lower] || null;
  if (normalized.code && admin1Code && normalized.code === admin1Code) return true;
  if (normalized.name && admin1Lower === normalized.name) return true;
  return false;
}

export async function resolveGeocodeData(searchName: string) {
  const searchVariants = buildSearchVariants(searchName);

  for (const variant of searchVariants) {
    const payload = await fetchCensusMatches(variant);
    if (hasAddressMatches(payload)) return payload;
  }

  const cityFallback = await fetchNominatimMatches(searchName);
  if (cityFallback && cityFallback.length > 0) {
    const matches = cityFallback
      .map((entry) => mapNominatimToCensusAddressMatch(entry))
      .filter((entry) => entry !== null);
    if (matches.length > 0) {
      return { result: { addressMatches: matches } };
    }
  }

  const parsed = splitCityState(searchName);
  if (parsed.city) {
    const addressPayload = await fetchCensusAddressMatches(parsed.city, parsed.state);
    if (hasAddressMatches(addressPayload)) return addressPayload;
  }

  for (const variant of searchVariants) {
    const openMeteo = await fetchOpenMeteoMatches(variant);
    if (!openMeteo?.results || openMeteo.results.length === 0) continue;
    const matches = openMeteo.results
      .map((entry) => mapOpenMeteoToCensusAddressMatch(entry))
      .filter((entry) => entry !== null);
    if (matches.length > 0) {
      return { result: { addressMatches: matches } };
    }
  }

  return null;
}

export function selectBestLocationCandidate(
  geocodeData: CensusGeocodeResponse,
  city: string,
  stateInput: string,
  hasState: boolean,
): ResolvedLocation | null {
  const locationCandidates =
    geocodeData.result?.addressMatches
      ?.map((match) => mapCensusCandidateToLocation(match))
      .filter((candidate): candidate is ResolvedLocation => candidate !== null) || [];

  const scoredCandidates = locationCandidates
    .map((entry) => ({
      entry,
      score: scoreCensusCandidateForQuery(
        entry.city,
        entry.admin1,
        city,
        stateInput,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const stateFilteredCandidates = hasState
    ? scoredCandidates.filter((item) =>
        admin1MatchesState(item.entry.admin1, stateInput),
      )
    : scoredCandidates;

  const cityMatchCandidates = stateFilteredCandidates.filter((item) =>
    isLikelyCityMatch(item.entry.city, city),
  );
  const fallbackCandidates =
    cityMatchCandidates.length > 0 ? cityMatchCandidates : stateFilteredCandidates;

  return (fallbackCandidates.length > 0 ? fallbackCandidates : scoredCandidates)[0]
    ?.entry || null;
}
