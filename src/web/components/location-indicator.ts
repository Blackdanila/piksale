/**
 * SVG location indicator showing where a residential complex
 * is positioned relative to Moscow's MKAD ring road.
 */

// Moscow center
const CENTER_LAT = 55.7522;
const CENTER_LNG = 37.6156;

// Approximate MKAD polygon (key points clockwise from North)
const MKAD_POINTS: [number, number][] = [
  [55.9085, 37.3948], // N-NW
  [55.9119, 37.5272], // N
  [55.9058, 37.6527], // N-NE
  [55.8845, 37.7831], // NE
  [55.8545, 37.8427], // E-NE
  [55.8028, 37.8421], // E
  [55.7527, 37.8430], // E-SE
  [55.7072, 37.8389], // SE
  [55.6580, 37.7691], // S-SE
  [55.6261, 37.6951], // S
  [55.6216, 37.5939], // S-SW
  [55.6408, 37.4944], // SW
  [55.6886, 37.3924], // W-SW
  [55.7343, 37.3527], // W
  [55.7832, 37.3395], // W-NW
  [55.8341, 37.3450], // NW
  [55.8693, 37.3580], // NW-N
];

interface LocationInfo {
  isInsideMkad: boolean;
  direction: string; // "С", "С-З", "Ю-В", etc.
  directionFull: string; // "Север", "Северо-Запад", etc.
  distanceKm: number; // from center
  label: string; // "Внутри МКАД, север" or "За МКАД, юго-запад"
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(
  lat: number,
  lng: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function getDirection(
  lat: number,
  lng: number,
): { short: string; full: string } {
  const dLat = lat - CENTER_LAT;
  const dLng = lng - CENTER_LNG;
  const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI; // 0 = North, 90 = East

  if (angle >= -22.5 && angle < 22.5) return { short: "С", full: "Север" };
  if (angle >= 22.5 && angle < 67.5) return { short: "С-В", full: "Северо-Восток" };
  if (angle >= 67.5 && angle < 112.5) return { short: "В", full: "Восток" };
  if (angle >= 112.5 && angle < 157.5) return { short: "Ю-В", full: "Юго-Восток" };
  if (angle >= 157.5 || angle < -157.5) return { short: "Ю", full: "Юг" };
  if (angle >= -157.5 && angle < -112.5) return { short: "Ю-З", full: "Юго-Запад" };
  if (angle >= -112.5 && angle < -67.5) return { short: "З", full: "Запад" };
  return { short: "С-З", full: "Северо-Запад" };
}

export function getLocationInfo(lat: number, lng: number): LocationInfo {
  const inside = pointInPolygon(lat, lng, MKAD_POINTS);
  const dir = getDirection(lat, lng);
  const dist = haversineKm(CENTER_LAT, CENTER_LNG, lat, lng);

  const label = inside
    ? `Внутри МКАД, ${dir.full.toLowerCase()}`
    : `За МКАД, ${dir.full.toLowerCase()}`;

  return {
    isInsideMkad: inside,
    direction: dir.short,
    directionFull: dir.full,
    distanceKm: dist,
    label,
  };
}

/**
 * Generate an SVG indicator showing location relative to MKAD.
 * Returns inline SVG string.
 */
export function locationIndicatorSvg(
  lat: number,
  lng: number,
  size = 120,
): string {
  const info = getLocationInfo(lat, lng);

  // Map coordinates to SVG space
  // Center of SVG = Moscow center
  // MKAD ring ≈ radius 38% of SVG size
  const cx = size / 2;
  const cy = size / 2;
  const mkadRadius = size * 0.34;

  // Calculate dot position
  // Scale: ~20km from center = edge of SVG
  const maxDistKm = 25;
  const scale = (size * 0.42) / maxDistKm;

  const dLat = lat - CENTER_LAT;
  const dLng = lng - CENTER_LNG;
  // Approximate km per degree at Moscow's latitude
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos(toRadians(CENTER_LAT));

  let dotX = cx + dLng * kmPerDegLng * scale;
  let dotY = cy - dLat * kmPerDegLat * scale; // SVG Y is inverted

  // Clamp dot within SVG bounds with padding
  const pad = 10;
  dotX = Math.max(pad, Math.min(size - pad, dotX));
  dotY = Math.max(pad, Math.min(size - pad, dotY));

  const dotColor = info.isInsideMkad ? "#3b82f6" : "#f59e0b";
  const dotGlow = info.isInsideMkad ? "#3b82f6" : "#f59e0b";

  // Generate MKAD polygon path in SVG coordinates
  const mkadSvgPoints = MKAD_POINTS.map(([pLat, pLng]) => {
    const px = cx + (pLng - CENTER_LNG) * kmPerDegLng * scale;
    const py = cy - (pLat - CENTER_LAT) * kmPerDegLat * scale;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="border-radius:12px;background:#141416;border:1px solid #2a2a2e">
  <!-- Grid circles -->
  <circle cx="${cx}" cy="${cy}" r="${mkadRadius * 0.45}" fill="none" stroke="#1c1c1f" stroke-width="0.5"/>
  <circle cx="${cx}" cy="${cy}" r="${mkadRadius * 0.9}" fill="none" stroke="#1c1c1f" stroke-width="0.5"/>
  <circle cx="${cx}" cy="${cy}" r="${mkadRadius * 1.35}" fill="none" stroke="#1c1c1f" stroke-width="0.5"/>

  <!-- Crosshair -->
  <line x1="${cx}" y1="${pad}" x2="${cx}" y2="${size - pad}" stroke="#1c1c1f" stroke-width="0.5"/>
  <line x1="${pad}" y1="${cy}" x2="${size - pad}" y2="${cy}" stroke="#1c1c1f" stroke-width="0.5"/>

  <!-- MKAD ring -->
  <polygon points="${mkadSvgPoints}" fill="rgba(59,130,246,0.04)" stroke="#2a2a2e" stroke-width="1.5" stroke-linejoin="round"/>

  <!-- Cardinal labels -->
  <text x="${cx}" y="${pad + 4}" text-anchor="middle" font-size="7" fill="#52525b" font-family="Inter,sans-serif">С</text>
  <text x="${cx}" y="${size - pad + 1}" text-anchor="middle" font-size="7" fill="#52525b" font-family="Inter,sans-serif">Ю</text>
  <text x="${pad - 1}" y="${cy + 2.5}" text-anchor="start" font-size="7" fill="#52525b" font-family="Inter,sans-serif">З</text>
  <text x="${size - pad + 1}" y="${cy + 2.5}" text-anchor="end" font-size="7" fill="#52525b" font-family="Inter,sans-serif">В</text>

  <!-- Center dot (Kremlin) -->
  <circle cx="${cx}" cy="${cy}" r="2" fill="#52525b"/>

  <!-- Location dot -->
  <circle cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="6" fill="${dotGlow}" opacity="0.2"/>
  <circle cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="4" fill="${dotColor}"/>
  <circle cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="2" fill="#fff" opacity="0.6"/>

  <!-- МКАД label -->
  <text x="${cx + mkadRadius * 0.6}" y="${cy - mkadRadius * 0.7}" font-size="6" fill="#3f3f46" font-family="Inter,sans-serif">МКАД</text>
</svg>`;
}

/**
 * Full location indicator component with SVG + text label
 */
export function locationIndicator(
  lat: number | null,
  lng: number | null,
  size = 120,
): string {
  if (lat == null || lng == null) return "";

  const info = getLocationInfo(lat, lng);
  const svg = locationIndicatorSvg(lat, lng, size);

  const badgeClass = info.isInsideMkad ? "badge-green" : "badge-neutral";
  const distText = info.distanceKm < 1
    ? "< 1 км от центра"
    : `${info.distanceKm.toFixed(0)} км от центра`;

  return `
  <div style="display:flex;align-items:center;gap:14px">
    ${svg}
    <div>
      <div style="font-size:14px;font-weight:500">${info.directionFull}</div>
      <div style="margin-top:4px"><span class="badge ${badgeClass}">${info.isInsideMkad ? "Внутри МКАД" : "За МКАД"}</span></div>
      <div style="font-size:12px;color:var(--text-3);margin-top:6px">${distText}</div>
    </div>
  </div>`;
}

/**
 * Compact indicator for cards (just the SVG, smaller)
 */
export function locationIndicatorCompact(
  lat: number | null,
  lng: number | null,
): string {
  if (lat == null || lng == null) return "";
  return locationIndicatorSvg(lat, lng, 48);
}
