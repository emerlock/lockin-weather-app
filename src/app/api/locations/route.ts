import { NextRequest, NextResponse } from "next/server";
import type { LocationSuggestion } from "@/types/weather";

interface GeocodingApiResponse {
  results?: Array<{
    name: string;
    admin1?: string;
  }>;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < 2) {
    return NextResponse.json({ data: [] as LocationSuggestion[] });
  }

  try {
    const params = new URLSearchParams({
      name: query,
      countryCode: "US",
      count: "10",
      language: "en",
      format: "json",
    });

    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
      { next: { revalidate: 60 * 30 } },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch location suggestions" },
        { status: response.status },
      );
    }

    const payload = (await response.json()) as GeocodingApiResponse;
    const unique = new Set<string>();
    const data: LocationSuggestion[] = [];

    for (const entry of payload.results || []) {
      if (!entry.name || !entry.admin1) continue;
      const key = `${entry.name}|${entry.admin1}`.toLowerCase();
      if (unique.has(key)) continue;
      unique.add(key);
      data.push({
        city: entry.name,
        state: entry.admin1,
        label: `${entry.name}, ${entry.admin1}`,
      });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while fetching location suggestions" },
      { status: 500 },
    );
  }
}
