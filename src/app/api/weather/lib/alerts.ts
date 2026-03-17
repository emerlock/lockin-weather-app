import { NWS_API_BASE, NWS_HEADERS } from "@/constants/weather";

interface NwsAlertProperties {
  id?: string;
  event?: string;
  headline?: string;
  areaDesc?: string;
  description?: string;
  instruction?: string;
  severity?: string;
  certainty?: string;
  messageType?: string;
  effective?: string;
  onset?: string;
  ends?: string;
  expires?: string;
}

interface NwsAlertFeature {
  properties?: NwsAlertProperties;
}

interface NwsActiveAlertsResponse {
  features?: NwsAlertFeature[];
}

interface NwsProductsByTypeResponse {
  "@graph"?: Array<{
    id?: string;
    "@id"?: string;
    issuanceTime?: string;
    issueTime?: string;
    effectiveTime?: string;
  }>;
}

interface NwsProductResponse {
  id?: string;
  productText?: string;
  issuanceTime?: string;
}

export type WeatherAlertEntry = {
  id: string;
  event: string;
  headline: string;
  areaDesc: string;
  description: string;
  instruction: string;
  severity: string;
  certainty: string;
  effective: string;
  onset: string;
  ends: string;
  expires: string;
};

type NwsPointsLike = {
  properties?: {
    forecastOffice?: string;
    forecastZone?: string;
    county?: string;
    fireWeatherZone?: string;
  };
};

function sanitizeAlertText(value?: string) {
  return value?.trim() ?? "";
}

function buildAlertId(
  event = "",
  headline = "",
  effective = "",
) {
  const trimmedEvent = sanitizeAlertText(event);
  const trimmedHeadline = sanitizeAlertText(headline);
  const trimmedEffective = sanitizeAlertText(effective);
  return trimmedEvent && trimmedHeadline
    ? `${trimmedEvent}-${trimmedHeadline}-${trimmedEffective}`
    : `${trimmedEvent || trimmedHeadline}-${trimmedEffective}` || "weather-alert";
}

function normalizeAlertDate(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

function extractResourceId(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split("/");
  const last = parts[parts.length - 1];
  return last ? last.toUpperCase() : undefined;
}

function parseUgcZoneCodesFromHeader(text: string) {
  // Parse UGC zone codes and ranges from raw product text header blocks.
  const compact = text.replace(/\r/g, "").replace(/\n/g, "");
  const zoneStart = compact.search(/[A-Z]{2,3}Z\d{3}(?:>\d{3})?/);
  if (zoneStart < 0) return new Set<string>();
  const zoneTail = compact.slice(zoneStart);
  const stampMatch = zoneTail.match(/-\d{6}-/);
  const zoneBlock = stampMatch
    ? zoneTail.slice(0, zoneTail.indexOf(stampMatch[0]) + stampMatch[0].length)
    : zoneTail;
  const normalizedBlock = zoneBlock.replace(/-([0-9]{3})(?=>)/g, "-$1");
  const tokens = normalizedBlock.split("-").map((token) => token.trim()).filter(Boolean);
  const zones = new Set<string>();
  let lastPrefix = "";

  for (const token of tokens) {
    if (/^\d{6}$/.test(token)) break;

    const prefixed = token.match(/^([A-Z]{2,3}Z)(\d{3})(?:>(\d{3}))?$/);
    if (prefixed) {
      const prefix = prefixed[1];
      const start = Number.parseInt(prefixed[2], 10);
      const end = Number.parseInt(prefixed[3] || prefixed[2], 10);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      lastPrefix = prefix;
      for (let code = low; code <= high; code += 1) {
        zones.add(`${prefix}${String(code).padStart(3, "0")}`);
      }
      continue;
    }

    const inherited = token.match(/^(\d{3})(?:>(\d{3}))?$/);
    if (inherited && lastPrefix) {
      const start = Number.parseInt(inherited[1], 10);
      const end = Number.parseInt(inherited[2] || inherited[1], 10);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let code = low; code <= high; code += 1) {
        zones.add(`${lastPrefix}${String(code).padStart(3, "0")}`);
      }
    }
  }

  return zones;
}

function extractProductText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as Record<string, unknown>;
  const direct = value.productText;
  if (typeof direct === "string") return direct;
  const nested = value.properties as Record<string, unknown> | undefined;
  if (nested && typeof nested.productText === "string") return nested.productText;
  return "";
}

function extractIssuanceTime(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as Record<string, unknown>;
  const direct = value.issuanceTime;
  if (typeof direct === "string") return direct;
  const nested = value.properties as Record<string, unknown> | undefined;
  if (nested && typeof nested.issuanceTime === "string") return nested.issuanceTime;
  if (nested && typeof nested.issueTime === "string") return nested.issueTime;
  if (nested && typeof nested.effectiveTime === "string") return nested.effectiveTime;
  return "";
}

function extractProductGraphId(entry?: {
  id?: string;
  "@id"?: string;
}) {
  if (!entry) return "";
  if (entry.id && entry.id.trim()) return entry.id.trim();
  if (entry["@id"] && entry["@id"].trim()) return entry["@id"].trim();
  return "";
}

function extractProductGraphTime(entry?: {
  issuanceTime?: string;
  issueTime?: string;
  effectiveTime?: string;
}) {
  if (!entry) return "";
  return (
    entry.issuanceTime ||
    entry.issueTime ||
    entry.effectiveTime ||
    ""
  );
}

function toAbsoluteNwsUrl(url: string) {
  // Normalize NWS product ids/paths into absolute API URLs.
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (/^[0-9a-fA-F-]{32,}$/.test(url)) return `${NWS_API_BASE}/products/${url}`;
  if (url.startsWith("products/")) return `${NWS_API_BASE}/${url}`;
  if (url.startsWith("/products/")) return `${NWS_API_BASE}${url}`;
  if (url.startsWith("/")) return `${NWS_API_BASE}${url}`;
  return `${NWS_API_BASE}/${url}`;
}

function buildHwoAlert(
  officeId: string,
  productText: string,
  issuanceTimeRaw: string,
  matchedZones: Set<string>,
): WeatherAlertEntry {
  // Convert HWO product text into a synthetic alert entry shape used by the client.
  const issuanceTime = normalizeAlertDate(issuanceTimeRaw);
  const summary = productText.trim();
  return {
    id: `HWO-${officeId}-${issuanceTimeRaw || "latest"}`,
    event: "Hazardous Weather Outlook",
    headline: `Hazardous Weather Outlook (${officeId})`,
    areaDesc: Array.from(matchedZones).join(", "),
    description: summary,
    instruction: "",
    severity: "Outlook",
    certainty: "Possible",
    effective: issuanceTime,
    onset: "",
    ends: "",
    expires: "",
  };
}

function selectActiveWeatherAlerts(features: NwsActiveAlertsResponse["features"] = []) {
  // Normalize CAP alert features and filter out canceled messages.
  const alerts: WeatherAlertEntry[] = [];
  for (const feature of features) {
    const properties = feature?.properties;
    if (!properties) continue;
    const messageType = sanitizeAlertText(properties.messageType).toLowerCase();
    if (messageType === "cancel") continue;

    const event = sanitizeAlertText(properties.event);
    const headline = sanitizeAlertText(properties.headline);
    if (!event && !headline) continue;

    alerts.push({
      id: buildAlertId(event, headline, properties.effective),
      event,
      headline,
      areaDesc: sanitizeAlertText(properties.areaDesc),
      description: sanitizeAlertText(properties.description),
      instruction: sanitizeAlertText(properties.instruction),
      severity: sanitizeAlertText(properties.severity),
      certainty: sanitizeAlertText(properties.certainty),
      effective: normalizeAlertDate(properties.effective),
      onset: normalizeAlertDate(properties.onset),
      ends: normalizeAlertDate(properties.ends),
      expires: normalizeAlertDate(properties.expires),
    });
  }
  return alerts;
}

async function fetchWithNwsHeaders(url: string, init?: RequestInit) {
  // Shared NWS fetch wrapper with required headers.
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      ...NWS_HEADERS,
    },
  });
}

async function fetchActiveWeatherAlertsByQuery(
  params: Record<string, string>,
) {
  // Fetch active alerts for a specific query dimension (point or zone).
  const urlParams = new URLSearchParams(params);
  const alertResponse = await fetchWithNwsHeaders(
    `${NWS_API_BASE}/alerts/active?${urlParams.toString()}`,
    { cache: "no-store" },
  );
  if (!alertResponse.ok) return [];
  const payload = (await alertResponse.json()) as NwsActiveAlertsResponse;
  return selectActiveWeatherAlerts(payload.features);
}

export async function fetchActiveWeatherAlerts(
  latitude: number,
  longitude: number,
  pointsData?: NwsPointsLike,
) {
  // Aggregate active CAP alerts by point/zone and augment with latest HWO when relevant.
  const alerts: WeatherAlertEntry[] = [];
  const seen = new Set<string>();

  const zoneIds = new Set<string | undefined>([
    extractResourceId(pointsData?.properties?.forecastZone),
    extractResourceId(pointsData?.properties?.county),
    extractResourceId(pointsData?.properties?.fireWeatherZone),
  ]);

  const uniqueZoneIds = Array.from(zoneIds).filter((zone) => !!zone) as string[];
  const point = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const officeId = extractResourceId(pointsData?.properties?.forecastOffice) || "";

  const queries: Array<Record<string, string>> = [
    { point },
    ...uniqueZoneIds.map((zone) => ({ zone })),
  ];

  for (const query of queries) {
    try {
      const fetched = await fetchActiveWeatherAlertsByQuery(query);
      for (const alert of fetched) {
        if (!alert.id || seen.has(alert.id)) continue;
        seen.add(alert.id);
        alerts.push(alert);
      }
    } catch {
      continue;
    }
  }

  if (officeId) {
    try {
      const hwoListResponse = await fetchWithNwsHeaders(
        `${NWS_API_BASE}/products/types/HWO/locations/${officeId}`,
        { cache: "no-store" },
      );
      if (hwoListResponse.ok) {
        const listPayload = (await hwoListResponse.json()) as NwsProductsByTypeResponse;
        const graph = listPayload["@graph"] || [];
        const latest = graph
          .filter((item) => !!extractProductGraphId(item))
          .sort((a, b) =>
            Date.parse(extractProductGraphTime(b)) - Date.parse(extractProductGraphTime(a)),
          )[0];

        const latestId = extractProductGraphId(latest);
        if (latestId) {
          const hwoProductResponse = await fetchWithNwsHeaders(
            toAbsoluteNwsUrl(latestId),
            { cache: "no-store" },
          );
          if (hwoProductResponse.ok) {
            const productPayload = (await hwoProductResponse.json()) as NwsProductResponse | Record<string, unknown>;
            const productText = extractProductText(productPayload);
            const issuanceTimeRaw =
              extractIssuanceTime(productPayload) ||
              extractProductGraphTime(latest) ||
              "";

            if (productText) {
              const productZones = parseUgcZoneCodesFromHeader(productText);
              const matchedZones = new Set(
                uniqueZoneIds.filter((zone) => productZones.has(zone)),
              );
              const shouldIncludeHwo = uniqueZoneIds.length === 0 || matchedZones.size > 0;
              if (shouldIncludeHwo) {
                const hwoAlert = buildHwoAlert(
                  officeId,
                  productText,
                  issuanceTimeRaw,
                  matchedZones,
                );
                if (!seen.has(hwoAlert.id)) {
                  seen.add(hwoAlert.id);
                  alerts.push(hwoAlert);
                }
              }
            }
          }
        }
      }
    } catch {
      // Keep response resilient if HWO product endpoint fails.
    }
  }

  return alerts;
}
