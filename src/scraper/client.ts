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

export async function fetchBlocks(locationId?: number): Promise<PikBlock[]> {
  const params = new URLSearchParams({ type: "1,2" });
  if (locationId) {
    params.set("locations", String(locationId));
  }
  return pikFetch<PikBlock[]>(`/v2/block?${params}`);
}

export async function fetchFlats(blockId: number): Promise<PikFlat[]> {
  const params = new URLSearchParams({
    block_id: String(blockId),
    type: "1",
  });
  return pikFetch<PikFlat[]>(`/v2/flat?${params}`);
}
