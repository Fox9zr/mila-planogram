/**
 * Phase 1.5 — equipment catalog stub for the Mila planogram domain.
 *
 * The upstream editor ships a residential furniture catalog (`$lib/utils/furnitureCatalog`).
 * The fork keeps that catalog interface untouched (minimal replacement) and adds this typed
 * equipment catalog, which is the contract retail planograms are built against:
 *
 *   - every item is described in millimetres (the planogram schema uses `unit: "mm"`);
 *   - shelf units carry an explicit shelf count and a mount type (shelf / hook);
 *   - lookups never return `undefined` to UI code — `resolveEquipment()` falls back to a
 *     visible placeholder so a missing catalog entry degrades instead of crashing.
 *
 * Only three synthetic Mila-типоразмеры are shipped at this stage (no real SKU data).
 */
export type EquipmentMount = 'shelf' | 'hook';

export interface EquipmentItem {
  /** Stable identifier used by planograms; also the placed-object catalog id. */
  id: string;
  /** Supplier code placeholder — real Mila SKUs arrive with the catalogue integration. */
  sku: string;
  name: string;
  category: string;
  /** Footprint along the shelf, millimetres. */
  width_mm: number;
  /** Footprint into the aisle, millimetres. */
  depth_mm: number;
  height_mm: number;
  /** Number of load levels (shelves / hook rails). */
  shelf_count: number;
  mount: EquipmentMount;
}

export interface EquipmentCatalog {
  list(): readonly EquipmentItem[];
  get(id: string): EquipmentItem | undefined;
  has(id: string): boolean;
  categories(): readonly string[];
}

export const MILA_EQUIPMENT_CATEGORY = 'Mila Стеллажи';

export const MILA_RACKS: readonly EquipmentItem[] = Object.freeze([
  {
    id: 'mila_rack_900_400_1800',
    sku: 'MILA-R-900',
    name: 'Стеллаж Mila 900×400×1800 (5 полок)',
    category: MILA_EQUIPMENT_CATEGORY,
    width_mm: 900,
    depth_mm: 400,
    height_mm: 1800,
    shelf_count: 5,
    mount: 'shelf',
  },
  {
    id: 'mila_rack_1200_400_1800',
    sku: 'MILA-R-1200',
    name: 'Стеллаж Mila 1200×400×1800 (5 полок)',
    category: MILA_EQUIPMENT_CATEGORY,
    width_mm: 1200,
    depth_mm: 400,
    height_mm: 1800,
    shelf_count: 5,
    mount: 'shelf',
  },
  {
    id: 'mila_rack_600_300_1600',
    sku: 'MILA-R-600',
    name: 'Стеллаж Mila 600×300×1600 (4 полки)',
    category: MILA_EQUIPMENT_CATEGORY,
    width_mm: 600,
    depth_mm: 300,
    height_mm: 1600,
    shelf_count: 4,
    mount: 'shelf',
  },
]);

/**
 * Rendered instead of a missing item: a neutral 900×400×1800 rack footprint with no SKU.
 * `id` is deliberately outside the catalog so callers can detect the substitution.
 */
export const PLACEHOLDER_EQUIPMENT: EquipmentItem = Object.freeze({
  id: 'equipment_unavailable',
  sku: '—',
  name: 'Оборудование не найдено',
  category: MILA_EQUIPMENT_CATEGORY,
  width_mm: 900,
  depth_mm: 400,
  height_mm: 1800,
  shelf_count: 5,
  mount: 'shelf',
});

const items: readonly EquipmentItem[] = MILA_RACKS;
const byId = new Map(items.map((item) => [item.id, item]));

export const equipmentCatalog: EquipmentCatalog = {
  list: () => items,
  get: (id) => byId.get(id),
  has: (id) => byId.has(id),
  categories: () => [...new Set(items.map((item) => item.category))],
};

/** Runtime guard: unknown ids resolve to a visible placeholder instead of `undefined`. */
export function resolveEquipment(id: string): EquipmentItem {
  const item = equipmentCatalog.get(id);
  if (!item) return PLACEHOLDER_EQUIPMENT;
  return item;
}

export function isPlaceholderEquipment(item: EquipmentItem): boolean {
  return item.id === PLACEHOLDER_EQUIPMENT.id;
}
