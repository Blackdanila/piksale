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
    const locations = b.locations as {
      parent?: { id?: number; name?: string };
      child?: { id?: number; name?: string };
    } | undefined;

    // Hierarchy: root(1) -> city/region -> district
    // /v1/location returns top-level locations (id:2 = "Москва и область")
    // But block hierarchy has: root(1)->Москва(2)->СВАО(32), or root(1)->МО(3)->Люберцы(8)
    // We need to map to the /v1/location IDs
    const parentId = locations?.parent?.id;
    const childId = locations?.child?.id;
    let locationId: number;
    if (parentId === 1) {
      // parent=root, child is top-level (city or region)
      locationId = childId ?? 0;
    } else {
      // parent=city/region, child=district — use parent
      locationId = parentId ?? childId ?? 0;
    }
    // Merge sub-regions into their top-level /v1/location IDs
    if (locationId === 3) locationId = 2;   // МО -> Москва и область
    if (locationId === 86) locationId = 81; // Лен. обл -> СПб и область

    return {
      id: b.id as number,
      name: (b.name as string) || "",
      slug: (b.slug as string) || null,
      location_id: locationId,
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

export async function fetchFlats(blockId: number): Promise<PikFlat[]> {
  // Fetch all flats for block via pagination (no bulk_id needed)
  const allFlats: PikFlat[] = [];
  const bulkNames = new Map<number, string>();
  let page = 1;
  const limit = 50;

  while (true) {
    const data = await pikFetch<{
      flats?: PikFlat[];
      count?: number;
      bulks?: Array<{ id: number; name?: string; title?: string }>;
    }>(`/v2/flat?block_id=${blockId}&type=1&page=${page}&limit=${limit}`);

    // Collect bulk names from first page
    if (page === 1 && data.bulks) {
      for (const b of data.bulks) {
        bulkNames.set(b.id, b.name ?? b.title ?? String(b.id));
      }
    }

    const flats = data.flats ?? [];
    if (flats.length === 0) break;

    allFlats.push(...flats);

    if (!data.count || allFlats.length >= data.count) break;
    page++;

    await new Promise((r) => setTimeout(r, 50));
  }

  // Enrich flats with bulk names
  for (const flat of allFlats) {
    if (flat.bulk_id && !flat.bulk_name) {
      flat.bulk_name = bulkNames.get(flat.bulk_id);
    }
  }

  return allFlats;
}
