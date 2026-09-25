import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parsePlanogram,
  serializePlanogram,
  semanticEqual,
  canonicalize,
  toEditorModel,
  fromEditorModel,
  roundTripPlanogram,
  PlanogramParseError,
} from '../../src/lib/planogram/serialize';
import type { Planogram } from '../../src/lib/planogram/types';

const fixturePath = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const rawFixture = (name: string) => readFileSync(fixturePath(name), 'utf-8');
const loadFixture = (name: string): Planogram => parsePlanogram(rawFixture(name));

describe('parsePlanogram: контракт схемы', () => {
  it('soap fixture парсится без ошибок', () => {
    const p = loadFixture('planogram-soap.json');
    expect(p.version).toBe(1);
    expect(p.unit).toBe('mm');
    expect(p.shelf_units).toHaveLength(1);
    expect(p.sku_facings).toHaveLength(4);
  });

  it('empty fixture: 1 стеллаж, пустые фейсинги', () => {
    const p = loadFixture('planogram-empty.json');
    expect(p.shelf_units).toHaveLength(1);
    expect(p.sku_facings).toEqual([]);
  });

  it('неизвестное поле отклоняется (additionalProperties: false)', () => {
    const raw = JSON.parse(rawFixture('planogram-soap.json'));
    raw.extra = 1;
    expect(() => parsePlanogram(raw)).toThrow(PlanogramParseError);
  });

  it('дробные миллиметры отклоняются', () => {
    const raw = JSON.parse(rawFixture('planogram-soap.json'));
    raw.sku_facings[0].x_mm = 12.5;
    expect(() => parsePlanogram(raw)).toThrow(/целыми/);
  });

  it('неверный unit / version отклоняются', () => {
    expect(() => parsePlanogram({ ...JSON.parse(rawFixture('planogram-soap.json')), unit: 'cm' })).toThrow(/unit/);
    expect(() => parsePlanogram({ ...JSON.parse(rawFixture('planogram-soap.json')), version: 2 })).toThrow(/version/);
  });

  it('битый JSON → PlanogramParseError, а не исключение парсера', () => {
    expect(() => parsePlanogram('{not json')).toThrow(PlanogramParseError);
  });

  it('sku_facings: [] допустимо, shelf_units: [] — нет (minItems 1)', () => {
    const base = JSON.parse(rawFixture('planogram-empty.json'));
    expect(parsePlanogram({ ...base, sku_facings: [] }).sku_facings).toEqual([]);
    expect(() => parsePlanogram({ ...base, shelf_units: [] })).toThrow(/minItems/);
  });
});

describe('сериализация и round-trip (2.4)', () => {
  it('serializePlanogram → parsePlanogram: семантический deepEqual для обеих fixtures', () => {
    for (const name of ['planogram-soap.json', 'planogram-empty.json']) {
      const original = loadFixture(name);
      const json = serializePlanogram(original);
      expect(semanticEqual(parsePlanogram(json), original)).toBe(true);
    }
  });

  it('порядок ключей не влияет на сравнение (нормализация)', () => {
    const a = { b: 1, a: [ { y: 2, x: 1 } ] };
    const b = { a: [ { x: 1, y: 2 } ], b: 1 };
    expect(semanticEqual(a, b)).toBe(true);
    expect(JSON.stringify(canonicalize(a))).toBe(JSON.stringify(canonicalize(b)));
  });

  it('round-trip JSON → редактор → JSON: deepEqual и стабильная сериализация', () => {
    const first = roundTripPlanogram(rawFixture('planogram-soap.json'));
    expect(first.equal).toBe(true);
    const second = roundTripPlanogram(first.json);
    expect(second.equal).toBe(true);
    expect(second.json).toBe(first.json); // сериализация идемпотентна
  });

  it('правка в модели переживает round-trip (drag фейсинга)', () => {
    const model = toEditorModel(loadFixture('planogram-soap.json'));
    model.planogram.sku_facings[0].x_mm = 120;
    model.promoMode = true;
    const json = serializePlanogram(fromEditorModel(model));
    const back = parsePlanogram(json);
    expect(back.sku_facings[0].x_mm).toBe(120);
    expect(back.promo_mode).toBe(true);
    expect(semanticEqual(back, fromEditorModel(model))).toBe(true);
  });

  it('created_at и promo_mode сохраняются, необязательные поля не выдумываются', () => {
    const empty = loadFixture('planogram-empty.json');
    expect(serializePlanogram(empty)).not.toContain('created_at');
    const soap = loadFixture('planogram-soap.json');
    expect(serializePlanogram(soap)).toContain('"created_at"');
    expect(serializePlanogram(soap)).toContain('"promo_mode"');
  });

  it('сериализация идёт в каноническом порядке ключей схемы', () => {
    const json = serializePlanogram(loadFixture('planogram-soap.json'));
    const keys = Object.keys(JSON.parse(json));
    expect(keys[0]).toBe('version');
    expect(keys).toContain('sku_facings');
    expect(keys.indexOf('unit')).toBeLessThan(keys.indexOf('name'));
  });
});
