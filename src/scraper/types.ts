export interface PikLocation {
  id: number;
  name: string;
  slug: string;
  coordinates?: { lat: number; lng: number };
}

export interface PikBlock {
  id: number;
  name: string;
  slug: string | null;
  location_id: number;
  address?: string;
  image?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  metro?: Array<{ name: string; color: string; time: number }>;
}

export interface PikBulk {
  id: number;
  name: string;
  block_id: number;
  address?: string;
}

export interface PikFlat {
  id: number;
  block_id: number;
  bulk_id: number;
  bulk_name?: string;
  number?: string;
  rooms: number;
  area: number;
  floor: number;
  status: string;
  price: number;
  meter_price?: number;
  meterPrice?: number;
  url?: string;
  address?: string;
  area_living?: number;
  area_kitchen?: number;
  ceiling_height?: number;
  finish?: string;
  layout?: {
    flat_plan_svg?: string;
    flat_plan_render?: string;
  };
  updated_at?: string;
}

export interface PikApiResponse<T> {
  count?: number;
  results?: T[];
  [key: string]: unknown;
}
