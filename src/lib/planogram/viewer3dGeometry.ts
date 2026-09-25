/**
 * Phase 3.2 — геометрия 3D-превью стеллажа (чистый модуль, без Three.js/DOM).
 *
 * Система координат сцены (правая, Y — вверх, единица = 1 м):
 *   X — вдоль ширины стеллажа (origin = левый край первого стеллажа);
 *   Y — вверх от пола;
 *   Z — в глубину, от плоскости фасада (0) в сторону торгового зала (+).
 *
 * Конвертация мм → сцена идёт исключительно через `mmToScene()` из geometry.ts
 * (единый helper, требование плана Phase 0), здесь он вызывается с
 * MM_TO_SCENE = 0.001.
 *
 * Модуль отдаёт список боксов — рендер (`ShelfUnit3D.svelte`) только собирает из
 * них меши, поэтому вся геометрия проверяется unit-тестами без WebGL.
 */
import type { Planogram, ShelfUnit } from './types';
import {
  DECK_MM,
  HOOK_RAIL_MM,
  PACK_DEPTH_MM,
  POST_MM,
  RACK_GAP_MM,
  facingsOnShelf,
  facingSpanMm,
  mmToScene,
  shelfHeights,
} from './geometry';

/** 1 мм документа = 0.001 единицы сцены (1 м). */
export const MM_TO_SCENE = 0.001;
/** Палитра фейсингов; индекс SKU выбирает цвет детерминированно. */
export const FACING_PALETTE: readonly number[] = Object.freeze([
  0x2563eb, 0x16a34a, 0xdb2777, 0xd97706, 0x7c3aed, 0x0891b2, 0xdc2626, 0x65a30d,
]);

export type SceneBoxKind = 'post' | 'deck' | 'hook_rail' | 'facing';

export interface SceneBox {
  /** Стабильный id для тестов и re-use меша при обновлении сцены. */
  id: string;
  kind: SceneBoxKind;
  shelf_unit_id: string;
  shelf_no?: number;
  sku?: string;
  /** Центр бокса в координатах сцены, метры. */
  position: [number, number, number];
  /** Полные размеры бокса (не полуразмеры), метры. */
  size: [number, number, number];
  color: number;
}

export interface SceneBounds {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  /** Радиус описывающей сферы — по нему ставится камера. */
  radius: number;
}

export interface PlanogramScene {
  boxes: SceneBox[];
  bounds: SceneBounds;
  racks: number;
  facings: number;
  /** Цвета фейсингов по SKU — для HTML-легенды рядом с canvas. */
  legend: { sku: string; color: number; name?: string }[];
  /** Итоговая ширина документa в мм (стеллажи + зазоры) — для проверок. */
  width_mm: number;
  height_mm: number;
}

export interface PlanogramScenePlacement {
  id: string;
  x0_mm: number;
}

/** Раскладка стеллажей слева направо с зазором RACK_GAP_MM. */
export function rackPlacements(planogram: Planogram): PlanogramScenePlacement[] {
  const out: PlanogramScenePlacement[] = [];
  let cursor = 0;
  for (const unit of planogram.shelf_units) {
    out.push({ id: unit.id, x0_mm: cursor });
    cursor += unit.width_mm + RACK_GAP_MM;
  }
  return out;
}

function box(
  id: string,
  kind: SceneBoxKind,
  unit: ShelfUnit,
  position: [number, number, number],
  size: [number, number, number],
  color: number,
  extra: { shelf_no?: number; sku?: string } = {},
): SceneBox {
  return { id, kind, shelf_unit_id: unit.id, ...extra, position, size, color };
}

const m = (mm: number): number => mmToScene(mm, MM_TO_SCENE);

/** Цвет фейсинга по порядку первого появления SKU — стабилен между рендерами. */
export function facingColor(planogram: Planogram, sku: string): number {
  const order: string[] = [];
  for (const facing of planogram.sku_facings) {
    if (!order.includes(facing.sku)) order.push(facing.sku);
  }
  const index = Math.max(0, order.indexOf(sku));
  return FACING_PALETTE[index % FACING_PALETTE.length];
}

/** Собирает все боксы сцены: стойки, полки (или крючковые штанги) и фейсинги. */
export function planogramScene(planogram: Planogram): PlanogramScene {
  const boxes: SceneBox[] = [];
  const placements = new Map(rackPlacements(planogram).map((p) => [p.id, p]));

  for (const unit of planogram.shelf_units) {
    const x0 = placements.get(unit.id)?.x0_mm ?? 0;
    const postW = POST_MM;
    const depth = unit.depth_mm;
    const height = unit.height_mm;

    // Стойки по бокам пролёта.
    for (const side of ['left', 'right'] as const) {
      const postX = side === 'left' ? x0 : x0 + unit.width_mm - postW;
      boxes.push(
        box(
          `${unit.id}:post:${side}`,
          'post',
          unit,
          [m(postX + postW / 2), m(height / 2), m(depth / 2)],
          [m(postW), m(height), m(depth)],
          0x94a3b8,
        ),
      );
    }

    const innerX = x0 + postW;
    const innerW = Math.max(0, unit.width_mm - postW * 2);
    const levels = shelfHeights(unit);

    levels.forEach((level, index) => {
      const shelfNo = index + 1;
      if (unit.mount === 'hook') {
        boxes.push(
          box(
            `${unit.id}:rail:${shelfNo}`,
            'hook_rail',
            unit,
            [m(innerX + innerW / 2), m(level), m(depth / 2)],
            [m(innerW), m(HOOK_RAIL_MM), m(POST_MM)],
            0x64748b,
            { shelf_no: shelfNo },
          ),
        );
      } else {
        boxes.push(
          box(
            `${unit.id}:deck:${shelfNo}`,
            'deck',
            unit,
            [m(innerX + innerW / 2), m(level), m(depth / 2)],
            [m(innerW), m(DECK_MM), m(depth)],
            0xe2e8f0,
            { shelf_no: shelfNo },
          ),
        );
      }

      for (const facing of facingsOnShelf(planogram.sku_facings, unit.id, shelfNo)) {
        const span = facingSpanMm(facing);
        const packDepth = Math.min(PACK_DEPTH_MM, depth * 0.6);
        const bottom = level + (unit.mount === 'hook' ? HOOK_RAIL_MM : DECK_MM);
        boxes.push(
          box(
            `${unit.id}:facing:${shelfNo}:${facing.sku}`,
            'facing',
            unit,
            [m(x0 + facing.x_mm + span / 2), m(bottom + facing.height_mm / 2), m(packDepth / 2 + depth * 0.05)],
            [m(span), m(facing.height_mm), m(packDepth)],
            facingColor(planogram, facing.sku),
            { shelf_no: shelfNo, sku: facing.sku },
          ),
        );
      }
    });
  }

  const legend: PlanogramScene['legend'] = [];
  for (const facing of planogram.sku_facings) {
    if (legend.some((entry) => entry.sku === facing.sku)) continue;
    legend.push({ sku: facing.sku, color: facingColor(planogram, facing.sku), name: facing.name });
  }

  const placements2 = rackPlacements(planogram);
  const last = placements2.at(-1);
  const widthMm = last ? last.x0_mm + (planogram.shelf_units.at(-1)?.width_mm ?? 0) : 0;
  const heightMm = planogram.shelf_units.reduce((max, u) => Math.max(max, u.height_mm), 0);

  return {
    boxes,
    bounds: sceneBounds(boxes),
    racks: planogram.shelf_units.length,
    facings: planogram.sku_facings.reduce((sum, f) => sum + f.facings, 0),
    legend,
    width_mm: widthMm,
    height_mm: heightMm,
  };
}

/** Ограничивающая сфера сцены; при пустой сцене возвращает безопасную заглушку. */
export function sceneBounds(boxes: readonly SceneBox[]): SceneBounds {
  if (boxes.length === 0) {
    return { min: [0, 0, 0], max: [1, 1, 1], center: [0.5, 0.5, 0.5], radius: 1 };
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], b.position[axis] - b.size[axis] / 2);
      max[axis] = Math.max(max[axis], b.position[axis] + b.size[axis] / 2);
    }
  }
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const radius = Math.max(
    0.5,
    Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2,
  );
  return { min, max, center, radius };
}

/**
 * Дистанция камеры, при которой сцена целиком попадает в кадр
 * (вертикальный и горизонтальный FOV учитываются).
 */
export function framingDistance(bounds: SceneBounds, fovDeg = 45, aspect = 16 / 9): number {
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const dist = Math.max(bounds.radius / Math.sin(vFov / 2), bounds.radius / Math.sin(hFov / 2));
  return Math.max(0.5, dist * 1.05);
}
