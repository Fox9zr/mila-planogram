import { describe, expect, it } from 'vitest';
import { MILA_RACKS, MILA_EQUIPMENT_CATEGORY, PLACEHOLDER_EQUIPMENT, equipmentCatalog, isPlaceholderEquipment, resolveEquipment } from '$lib/planogram/equipmentCatalog';
import { furnitureCatalog, getCatalogItem, getCatalogItemOrPlaceholder, getFurnitureSize } from '$lib/utils/furnitureCatalog';

describe('Mila equipment catalog stub (Phase 1.5)', () => {
  it('ships exactly three millimetre shelf units', () => {
    expect(equipmentCatalog.list()).toHaveLength(3);
    expect(MILA_RACKS.map((r) => [r.width_mm, r.depth_mm, r.height_mm, r.shelf_count])).toEqual([
      [900, 400, 1800, 5],
      [1200, 400, 1800, 5],
      [600, 300, 1600, 4],
    ]);
    for (const rack of MILA_RACKS) {
      expect(rack.mount).toBe('shelf');
      expect(rack.sku).not.toBe('');
      expect(rack.category).toBe(MILA_EQUIPMENT_CATEGORY);
    }
    expect(equipmentCatalog.categories()).toEqual([MILA_EQUIPMENT_CATEGORY]);
  });

  it('resolves a missing item to a visible placeholder instead of undefined', () => {
    expect(equipmentCatalog.get('mila_rack_900_400_1800')).toBeDefined();
    expect(equipmentCatalog.get('does_not_exist')).toBeUndefined();
    expect(resolveEquipment('does_not_exist')).toBe(PLACEHOLDER_EQUIPMENT);
    expect(isPlaceholderEquipment(resolveEquipment('does_not_exist'))).toBe(true);
    expect(isPlaceholderEquipment(resolveEquipment('mila_rack_900_400_1800'))).toBe(false);
    expect(PLACEHOLDER_EQUIPMENT.id).not.toBe(MILA_RACKS[0].id);
  });

  it('keeps the furniture catalog usable and guarded for unknown ids', () => {
    expect(getCatalogItem('does_not_exist')).toBeUndefined();
    expect(getCatalogItemOrPlaceholder('does_not_exist').width).toBeGreaterThan(0);
    for (const rack of MILA_RACKS) {
      const def = getCatalogItem(rack.id);
      expect(def, rack.id).toBeDefined();
      // Catalog stores centimetres; the planogram contract is millimetres.
      expect(def!.width).toBe(rack.width_mm / 10);
      expect(def!.depth).toBe(rack.depth_mm / 10);
      expect(def!.height).toBe(rack.height_mm / 10);
      expect(getFurnitureSize({ catalogId: rack.id } as never)).toEqual({ width: def!.width, depth: def!.depth, height: def!.height });
    }
    expect(furnitureCatalog.filter((item) => item.category === MILA_EQUIPMENT_CATEGORY)).toHaveLength(MILA_RACKS.length);
  });
});
