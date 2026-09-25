/**
 * Phase 2 — planogram geometry helpers (pure, unit = mm).
 *
 * Coordinate system (see schema/planogram.schema.json):
 *   origin = left-bottom corner of the shelf unit; X runs along the shelf face.
 *
 * Nothing here touches the residential editor models (`FurnitureItem`, walls, cm):
 * the retail domain is millimetre-only and is rendered by its own component.
 */
import type { ShelfUnit, SkuFacing } from './types';

/** Snap mode kinds reported back to the UI so it can explain what it did. */
export type SnapKind = 'left_edge' | 'right_edge' | 'neighbour' | 'grid' | null;

/** «Акция 10 см» — the promo mode snaps to a 100 mm grid. */
export const PROMO_GRID_MM = 100;
/** Free mode (default): millimetre edge-to-edge snapping tolerance. */
export const EDGE_SNAP_MM = 25;
/** Frame post width used by the side projection, mm. */
export const POST_MM = 40;
/** Shelf deck thickness used by the side projection, mm. */
export const DECK_MM = 20;

/** Canonical mm → scene(pixel) conversion. All rendering must use this. */
export function mmToScene(mm: number, pxPerMm = 1): number {
  return mm * pxPerMm;
}

/** Inverse of `mmToScene`, used by drag handlers. */
export function sceneToMm(px: number, pxPerMm = 1): number {
  return px / pxPerMm;
}

/**
 * Levels (deck heights above the floor, mm) for a shelf unit.
 * `shelf_heights_mm` wins when it covers every shelf; otherwise the shelves are
 * distributed evenly, so the highest shelf sits on top of the rack.
 */
export function shelfHeights(unit: ShelfUnit): number[] {
  const declared = unit.shelf_heights_mm;
  if (declared && declared.length >= unit.shelf_count) {
    return declared
      .slice(0, unit.shelf_count)
      .map((h) => Math.max(0, Math.min(h, unit.height_mm)));
  }
  const levels: number[] = [];
  for (let i = 1; i <= unit.shelf_count; i += 1) {
    levels.push(Math.round((unit.height_mm * i) / unit.shelf_count));
  }
  return levels;
}

/** Heap of one facing: `facings` packs of `width_mm` standing side by side. */
export function facingSpanMm(facing: SkuFacing): number {
  return facing.width_mm * facing.facings;
}

export function facingEndMm(facing: SkuFacing): number {
  return facing.x_mm + facingSpanMm(facing);
}

/** Largest x that still keeps the whole heap inside the shelf. */
export function maxFacingX(unit: ShelfUnit, span: number): number {
  return Math.max(0, unit.width_mm - span);
}

export function facingsOnShelf(
  facings: readonly SkuFacing[],
  shelfUnitId: string,
  shelfNo: number,
): SkuFacing[] {
  return facings.filter((f) => f.shelf_unit_id === shelfUnitId && f.shelf_no === shelfNo);
}

export function facingFitsShelf(facing: SkuFacing, unit: ShelfUnit): boolean {
  return facing.x_mm >= 0 && facingEndMm(facing) <= unit.width_mm;
}

export interface ClampResult {
  facing: SkuFacing;
  /** True when the requested position had to be pulled back to the shelf. */
  clamped: boolean;
  /** Human-readable reason, suitable for the tooltip. */
  warning: string | null;
}

/**
 * Runtime clamp: a facing can never be left half off the shelf. The clamp is
 * reported (`clamped` + `warning`) so the UI can show a red frame and a tooltip
 * instead of silently moving the object back.
 */
export function clampFacingToShelf(facing: SkuFacing, unit: ShelfUnit): ClampResult {
  const span = facingSpanMm(facing);
  const max = maxFacingX(unit, span);
  if (span > unit.width_mm) {
    const warning = `Габарит ${span} мм больше ширины полки ${unit.width_mm} мм — упирается в обе границы`;
    return { facing: { ...facing, x_mm: 0 }, clamped: true, warning };
  }
  if (facing.x_mm < 0) {
    return {
      facing: { ...facing, x_mm: 0 },
      clamped: true,
      warning: `Левый край полки: левее 0 мм нельзя (было ${Math.round(facing.x_mm)} мм)`,
    };
  }
  if (facing.x_mm > max) {
    return {
      facing: { ...facing, x_mm: max },
      clamped: true,
      warning: `Правый край полки: ${facingEndMm(facing)} мм > ${unit.width_mm} мм — сдвинуто на ${max} мм`,
    };
  }
  return { facing, clamped: false, warning: null };
}

export interface SnapInput {
  /** Requested position before snapping, mm. */
  rawX: number;
  /** Full heap width (width_mm × facings), mm. */
  span: number;
  unit: ShelfUnit;
  /** Other facings on the same shelf — edges snap edge-to-edge against them. */
  neighbours: readonly SkuFacing[];
  /** «Акция 10 см»: snap to a 100 mm grid instead of the millimetre edge set. */
  promoMode: boolean;
}

export interface SnapResult {
  x_mm: number;
  kind: SnapKind;
}

/**
 * Snap the requested x to the nearest edge: neighbour edges and shelf edges in
 * the default mode, the 100 mm promo grid when «акция» is on.
 * Values stay integral millimetres — that is what the JSON schema allows.
 */
export function snapFacingX({ rawX, span, unit, neighbours, promoMode }: SnapInput): SnapResult {
  const max = maxFacingX(unit, span);
  const raw = Math.max(0, Math.min(max, Math.round(rawX)));

  const candidates: { x: number; kind: SnapKind }[] = [
    { x: 0, kind: 'left_edge' },
    { x: unit.width_mm, kind: 'right_edge' },
  ];
  if (promoMode) {
    for (let g = PROMO_GRID_MM; g < unit.width_mm; g += PROMO_GRID_MM) {
      candidates.push({ x: g, kind: 'grid' });
    }
  } else {
    for (const n of neighbours) {
      candidates.push({ x: n.x_mm, kind: 'neighbour' });
      candidates.push({ x: facingEndMm(n), kind: 'neighbour' });
    }
  }

  const tolerance = promoMode ? PROMO_GRID_MM / 2 : EDGE_SNAP_MM;
  let best: { x: number; kind: SnapKind; distance: number } | null = null;
  for (const candidate of candidates) {
    // A shelf-edge candidate is only reachable once the heap is pushed flush.
    const x = Math.max(0, Math.min(max, candidate.x));
    const distance = Math.abs(x - raw);
    if (distance > tolerance) continue;
    if (!best || distance < best.distance) best = { x, kind: candidate.kind, distance };
  }

  return best ? { x_mm: Math.round(best.x), kind: best.kind } : { x_mm: raw, kind: null };
}
