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
      url: (b.url as string) || undefined,
      latitude: b.latitude ? parseFloat(String(b.latitude)) : undefined,
      longitude: b.longitude ? parseFloat(String(b.longitude)) : undefined,
    } as PikBlock;
  });
}

export async function fetchBlockImages(): Promise<Map<number, string>> {
  const imageMap = new Map<number, string>();

  // Get all locations first
  const locations = await fetchLocations();

  for (const loc of locations) {
    try {
      const data = await pikFetch<{
        blocks?: Array<{
          id: number;
          image?: {
            filter?: { desktop?: string; mobile?: string };
            last?: string;
          };
        }>;
      }>(`/v2/filter?type=1&location=${loc.id}`);

      for (const block of data.blocks ?? []) {
        const img =
          block.image?.filter?.desktop ??
          block.image?.filter?.mobile ??
          block.image?.last ??
          null;
        if (img) imageMap.set(block.id, img);
      }
    } catch {
      // Some locations may not have filter data
    }
  }

  return imageMap;
}

export async function fetchBlockImageFromPage(pikPath: string): Promise<string | null> {
  try {
    const url = `https://www.pik.ru${pikPath}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "PIKsale/1.0" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Try db-estate CDN first (high-res renders)
    const match1 = html.match(/https:\/\/\d+\.db-estate\.cdn\.pik-service\.ru\/block\/[^"\s]+\.(jpg|png|webp)/);
    if (match1) return match1[0];
    // Then try cdn.pik.ru slider images
    const match2 = html.match(/https:\/\/cdn\.pik\.ru\/content\/slider\/[^"\s]+\.(jpg|png|webp)/);
    if (match2) return match2[0];
    // Any content CDN image
    const match3 = html.match(/https:\/\/content\.cdn\.pik-service\.ru\/[^"\s]+\.(jpg|png|webp)/);
    if (match3) return match3[0];
    return null;
  } catch {
    return null;
  }
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
