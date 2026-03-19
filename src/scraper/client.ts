import type { PikLocation, PikBlock, PikFlat } from "./types.js";

const BASE_URL = "https://api.pik.ru";

async function pikFetch<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "PIKsale/1.0",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`PIK API error: ${res.status} ${res.statusText} for ${url}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchLocations(): Promise<PikLocation[]> {
  return pikFetch<PikLocation[]>("/v1/location");
}

export async function fetchBlocks(): Promise<PikBlock[]> {
  // v1/block with metadata returns full data (coords, locations, address)
  const raw = await pikFetch<Record<string, unknown>[]>("/v1/block?metadata=1&types=1,2");

  return raw.map((b) => {
    // Extract location_id from nested locations.child.id
    const locations = b.locations as { child?: { id?: number } } | undefined;
    const locationId = locations?.child?.id;

    return {
      id: b.id as number,
      name: (b.name as string) || "",
      slug: (b.slug as string) || null,
      location_id: locationId ?? 0,
      address: (b.address as string) || (b.county as string) || undefined,
      image: undefined,
      latitude: b.latitude ? parseFloat(String(b.latitude)) : undefined,
      longitude: b.longitude ? parseFloat(String(b.longitude)) : undefined,
    } as PikBlock;
  });
}

export async function fetchFlats(blockId: number): Promise<PikFlat[]> {
  const params = new URLSearchParams({
    block_id: String(blockId),
    type: "1",
  });
  return pikFetch<PikFlat[]>(`/v2/flat?${params}`);
}
