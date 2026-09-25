import type { Planogram, ShelfUnit, SkuFacing } from './types';

/** Кастомный валидатор границ: x_mm + width_mm*facings <= shelf width (в JSON-схеме draft-07 невыразимо). */
export interface BoundsViolation {
  sku: string;
  shelf_unit_id: string;
  shelf_no?: number;
  reason: 'out_of_shelf' | 'unknown_shelf' | 'bad_shelf_no';
  detail: string;
}

export function validatePlanogramBounds(p: Planogram): BoundsViolation[] {
  const violations: BoundsViolation[] = [];
  const shelves = new Map<string, ShelfUnit>(p.shelf_units.map(s => [s.id, s]));
  for (const f of p.sku_facings) {
    const shelf = shelves.get(f.shelf_unit_id);
    if (!shelf) {
      violations.push({ sku: f.sku, shelf_unit_id: f.shelf_unit_id, shelf_no: f.shelf_no, reason: 'unknown_shelf', detail: `стеллаж ${f.shelf_unit_id} не найден` });
      continue;
    }
    if (f.shelf_no < 1 || f.shelf_no > shelf.shelf_count) {
      violations.push({ sku: f.sku, shelf_unit_id: f.shelf_unit_id, shelf_no: f.shelf_no, reason: 'bad_shelf_no', detail: `полка ${f.shelf_no} вне 1..${shelf.shelf_count}` });
      continue;
    }
    const end = f.x_mm + f.width_mm * f.facings;
    if (end > shelf.width_mm) {
      violations.push({ sku: f.sku, shelf_unit_id: f.shelf_unit_id, shelf_no: f.shelf_no, reason: 'out_of_shelf', detail: `фейсинг заканчивается на ${end} мм > ширина полки ${shelf.width_mm} мм` });
    }
  }
  return violations;
}
