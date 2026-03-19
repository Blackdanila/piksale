import type { PikLocation, PikBlock, PikBulk, PikFlat } from "./types.js";

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
  const raw = await pikFetch<Record<string, unknown>[]>("/v1/block?metadata=1&types=1,2");

  return raw.map((b) => {
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

export async function fetchBulks(blockId: number): Promise<PikBulk[]> {
  return pikFetch<PikBulk[]>(`/v1/bulk?block_id=${blockId}&type=1`);
}

export async function fetchFlats(blockId: number, bulkId: number): Promise<PikFlat[]> {
  const data = await pikFetch<{ flats?: PikFlat[] }>(
    `/v2/flat?block_id=${blockId}&bulk_id=${bulkId}&type=1`,
  );
  return data.flats ?? [];
}
