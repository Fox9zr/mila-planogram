import { describe, it, expect } from 'vitest';
import {
  mmToScene,
  sceneToMm,
  shelfHeights,
  facingSpanMm,
  facingEndMm,
  facingsOnShelf,
  maxFacingX,
  clampFacingToShelf,
  snapFacingX,
  overshootWarning,
  PROMO_GRID_MM,
  EDGE_SNAP_MM,
} from '../../src/lib/planogram/geometry';
import type { ShelfUnit, SkuFacing } from '../../src/lib/planogram/types';

const unit: ShelfUnit = {
  id: 'shelf-1',
  width_mm: 900,
  depth_mm: 400,
  height_mm: 1800,
  shelf_count: 5,
  mount: 'shelf',
};

const facing = (over: Partial<SkuFacing> = {}): SkuFacing => ({
  sku: 'SYN-0001',
  shelf_unit_id: 'shelf-1',
  shelf_no: 1,
  x_mm: 0,
  width_mm: 60,
  height_mm: 120,
  facings: 3,
  ...over,
});

describe('geometry: mm ↔ scene', () => {
  it('mmToScene / sceneToMm симметричны', () => {
    expect(mmToScene(900, 0.32)).toBeCloseTo(288, 6);
    expect(sceneToMm(288, 0.32)).toBeCloseTo(900, 6);
  });

  it('равномерные полки: последняя на верх стеллажа', () => {
    expect(shelfHeights(unit)).toEqual([360, 720, 1080, 1440, 1800]);
  });

  it('явные высоты полок уважаются (и обрезаются по столу стеллажа)', () => {
    expect(shelfHeights({ ...unit, shelf_heights_mm: [200, 600, 1000, 1400, 2000] }))
      .toEqual([200, 600, 1000, 1400, 1800]);
  });

  it('габарит и конец фейсинга считаются по facings', () => {
    const f = facing({ x_mm: 180, width_mm: 70, facings: 2 });
    expect(facingSpanMm(f)).toBe(140);
    expect(facingEndMm(f)).toBe(320);
  });

  it('facingsOnShelf фильтрует по стеллажу и номеру полки', () => {
    const list = [facing(), facing({ sku: 'B', shelf_no: 3 }), facing({ sku: 'C', shelf_unit_id: 'x' })];
    expect(facingsOnShelf(list, 'shelf-1', 1).map((f) => f.sku)).toEqual(['SYN-0001']);
  });
});

describe('geometry: кламп границ полки', () => {
  it('фейсинг в границах не двигается', () => {
    const res = clampFacingToShelf(facing({ x_mm: 100 }), unit);
    expect(res.clamped).toBe(false);
    expect(res.warning).toBeNull();
    expect(res.facing.x_mm).toBe(100);
  });

  it('выход вправо клампится и объясняется (не молча)', () => {
    const res = clampFacingToShelf(facing({ x_mm: 880 }), unit); // 880 + 180 > 900
    expect(res.clamped).toBe(true);
    expect(res.facing.x_mm).toBe(maxFacingX(unit, 180));
    expect(res.facing.x_mm).toBe(720);
    expect(res.warning).toContain('900');
  });

  it('выход влево клампится в 0', () => {
    const res = clampFacingToShelf(facing({ x_mm: -40 }), unit);
    expect(res.clamped).toBe(true);
    expect(res.facing.x_mm).toBe(0);
    expect(res.warning).toBeTruthy();
  });

  it('габарит шире полки → предупреждение и x = 0', () => {
    const res = clampFacingToShelf(facing({ width_mm: 500, facings: 3 }), unit); // 1500 > 900
    expect(res.facing.x_mm).toBe(0);
    expect(res.warning).toContain('1500');
  });
});

describe('geometry: сообщение о выходе за полку (2.3/2.5)', () => {
  it('внутри полки — тишина', () => {
    expect(overshootWarning(unit, 180, 400)).toBeNull();
    expect(overshootWarning(unit, 180, 0)).toBeNull();
  });

  it('перелёт вправо/влево объясняется и остаётся в границах полки', () => {
    expect(overshootWarning(unit, 180, 1200)).toContain('Правый край полки');
    expect(overshootWarning(unit, 180, -300)).toContain('Левый край полки');
    const res = clampFacingToShelf(facing({ x_mm: maxFacingX(unit, 180) }), unit);
    expect(res.clamped).toBe(false); // позиция уже валидна, объясняет overshootWarning
  });
});

describe('geometry: мм-прилипание (2.3)', () => {
  it('по умолчанию стык-в-стык к соседу слева', () => {
    const neighbour = facing({ sku: 'N', x_mm: 0, width_mm: 60, facings: 3 }); // конец 180
    const res = snapFacingX({
      rawX: 190, span: 180, unit, neighbours: [neighbour], promoMode: false,
    });
    expect(res.kind).toBe('neighbour');
    expect(res.x_mm).toBe(180);
  });

  it('прилипание к левому краю полки', () => {
    const res = snapFacingX({ rawX: 12, span: 180, unit, neighbours: [], promoMode: false });
    expect(res.kind).toBe('left_edge');
    expect(res.x_mm).toBe(0);
  });

  it('прилипание к правому краю: габарит встаёт вплотную к концу полки', () => {
    const res = snapFacingX({ rawX: 725, span: 180, unit, neighbours: [], promoMode: false });
    expect(res.kind).toBe('right_edge');
    expect(res.x_mm).toBe(720);
  });

  it('далеко от краёв — без прилипания (но всегда целые мм)', () => {
    const res = snapFacingX({ rawX: 400.4, span: 180, unit, neighbours: [], promoMode: false });
    expect(res.kind).toBeNull();
    expect(res.x_mm).toBe(400);
  });

  it('допуск базового режима = 25 мм, дальше снап не срабатывает', () => {
    const far = snapFacingX({ rawX: 300, span: 180, unit, neighbours: [], promoMode: false });
    expect(far.kind).toBeNull();
    const near = snapFacingX({ rawX: 300, span: 180, unit, neighbours: [facing({ x_mm: 320 })], promoMode: false });
    expect(near.kind).toBe('neighbour');
    expect(near.x_mm).toBe(320);
    expect(EDGE_SNAP_MM).toBe(25);
  });

  it('режим «акция 10 см» — сетка 100 мм', () => {
    const res = snapFacingX({ rawX: 293, span: 180, unit, neighbours: [], promoMode: true });
    expect(res.kind).toBe('grid');
    expect(res.x_mm).toBe(300);
    expect(PROMO_GRID_MM).toBe(100);
    const mid = snapFacingX({ rawX: 250, span: 180, unit, neighbours: [], promoMode: true });
    expect([0, 100, 200, 300, 400, 500, 600, 700]).toContain(mid.x_mm);
    expect(mid.x_mm % 100).toBe(0);
  });

  it('результат снапа всегда остаётся в границах полки', () => {
    for (const raw of [-500, 0, 333, 899, 5000]) {
      const res = snapFacingX({ rawX: raw, span: 180, unit, neighbours: [], promoMode: false });
      expect(res.x_mm).toBeGreaterThanOrEqual(0);
      expect(res.x_mm).toBeLessThanOrEqual(720);
    }
  });
});
