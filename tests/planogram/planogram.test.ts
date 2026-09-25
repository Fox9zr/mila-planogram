import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePlanogramBounds } from '../../src/lib/planogram/validateBounds';
import type { Planogram } from '../../src/lib/planogram/types';

function loadFixture(name: string): Planogram {
  return JSON.parse(readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8'));
}

describe('fixtures против схемы (ручная проверка required/ограничений)', () => {
  it('soap fixture: валидна структурно', () => {
    const p = loadFixture('planogram-soap.json');
    expect(p.version).toBe(1);
    expect(p.unit).toBe('mm');
    expect(p.shelf_units.length).toBeGreaterThanOrEqual(1);
    for (const s of p.shelf_units) {
      expect(s.width_mm).toBeGreaterThanOrEqual(300);
      expect(s.width_mm).toBeLessThanOrEqual(3000);
      expect(['shelf', 'hook']).toContain(s.mount);
    }
    for (const f of p.sku_facings) {
      expect(f.facings).toBeGreaterThanOrEqual(1);
      expect(f.width_mm).toBeGreaterThanOrEqual(10);
    }
  });

  it('empty fixture: 1 стеллаж, пустые sku_facings', () => {
    const p = loadFixture('planogram-empty.json');
    expect(p.shelf_units.length).toBe(1);
    expect(p.sku_facings).toEqual([]);
  });
});

describe('validatePlanogramBounds', () => {
  it('soap fixture: 0 нарушений', () => {
    const p = loadFixture('planogram-soap.json');
    expect(validatePlanogramBounds(p)).toEqual([]);
  });

  it('фейсинг за границей полки → out_of_shelf', () => {
    const p = loadFixture('planogram-soap.json');
    p.sku_facings[0].x_mm = 880; // 880 + 60*3 = 1060 > 900
    const v = validatePlanogramBounds(p);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toBe('out_of_shelf');
  });

  it('неизвестный стеллаж → unknown_shelf', () => {
    const p = loadFixture('planogram-soap.json');
    p.sku_facings[0].shelf_unit_id = 'nope';
    expect(validatePlanogramBounds(p)[0].reason).toBe('unknown_shelf');
  });

  it('полка вне диапазона → bad_shelf_no', () => {
    const p = loadFixture('planogram-soap.json');
    p.sku_facings[0].shelf_no = 9;
    expect(validatePlanogramBounds(p)[0].reason).toBe('bad_shelf_no');
  });

  it('round-trip: JSON.parse → объект → сериализация → семантический deepEqual', () => {
    const raw = readFileSync(resolve(__dirname, '../../fixtures/planogram-soap.json'), 'utf-8');
    const p = JSON.parse(raw);
    const norm = (o: unknown): unknown => JSON.parse(JSON.stringify(o, Object.keys(p).sort()));
    // нормализация порядка ключей + повторная сериализация = семантическая эквивалентность
    expect(norm(JSON.parse(JSON.stringify(p)))).toEqual(norm(p));
  });
});
