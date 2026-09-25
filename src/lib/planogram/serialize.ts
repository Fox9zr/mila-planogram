/**
 * Phase 2.4 — planogram serialization (editor ⇄ Planogram JSON).
 *
 * The Phase 0 contract is schema/planogram.schema.json (draft-07, unit=mm).
 * `parsePlanogram()` enforces that contract in code (required fields, ranges,
 * enums, integral millimetres, `additionalProperties: false`), which is also
 * what makes the editor ⇄ JSON round-trip meaningful.
 *
 * Round-trip criterion (per plan v2.2): a semantic deepEqual of the normalized
 * objects — key order and serialization formatting must not matter.
 */
import type { MountType, Planogram, ShelfUnit, SkuFacing } from './types';

export class PlanogramParseError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Планограмма не соответствует схеме: ${issues.join('; ')}`);
    this.name = 'PlanogramParseError';
    this.issues = issues;
  }
}

/** Canonical key order — mirrors the schema's property order. */
export const PLANOGRAM_KEYS = [
  'version',
  'unit',
  'name',
  'category',
  'store_format',
  'created_at',
  'promo_mode',
  'shelf_units',
  'sku_facings',
] as const;
export const SHELF_UNIT_KEYS = [
  'id',
  'label',
  'width_mm',
  'depth_mm',
  'height_mm',
  'shelf_count',
  'mount',
  'shelf_heights_mm',
] as const;
export const SKU_FACING_KEYS = [
  'sku',
  'name',
  'image_url',
  'shelf_unit_id',
  'shelf_no',
  'x_mm',
  'width_mm',
  'height_mm',
  'facings',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkString(
  value: unknown,
  path: string,
  issues: string[],
  { minLength = 1, maxLength = Infinity, optional = false } = {},
): void {
  if (value === undefined) {
    if (!optional) issues.push(`${path}: обязательное поле отсутствует`);
    return;
  }
  if (typeof value !== 'string') {
    issues.push(`${path}: ожидалась строка`);
    return;
  }
  if (value.length < minLength) issues.push(`${path}: короче ${minLength} символов`);
  if (value.length > maxLength) issues.push(`${path}: длиннее ${maxLength} символов`);
}

function checkInteger(
  value: unknown,
  path: string,
  issues: string[],
  min: number,
  max: number,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${path}: ожидалось число`);
    return;
  }
  if (!Number.isInteger(value)) {
    issues.push(`${path}: миллиметры должны быть целыми (получено ${value})`);
    return;
  }
  if (value < min || value > max) issues.push(`${path}: ${value} вне диапазона ${min}..${max}`);
}

function checkKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`${path}.${key}: неизвестное поле (additionalProperties: false)`);
  }
}

function parseShelfUnit(value: unknown, index: number, issues: string[]): ShelfUnit | null {
  const path = `shelf_units[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${path}: ожидался объект`);
    return null;
  }
  checkKeys(value, SHELF_UNIT_KEYS, path, issues);
  checkString(value.id, `${path}.id`, issues);
  checkString(value.label, `${path}.label`, issues, { optional: true });
  checkInteger(value.width_mm, `${path}.width_mm`, issues, 300, 3000);
  checkInteger(value.depth_mm, `${path}.depth_mm`, issues, 200, 1200);
  checkInteger(value.height_mm, `${path}.height_mm`, issues, 1000, 3000);
  checkInteger(value.shelf_count, `${path}.shelf_count`, issues, 1, 10);
  if (value.mount !== 'shelf' && value.mount !== 'hook') {
    issues.push(`${path}.mount: ожидалось "shelf" или "hook"`);
  }
  const heights = value.shelf_heights_mm;
  if (heights !== undefined) {
    if (!Array.isArray(heights)) issues.push(`${path}.shelf_heights_mm: ожидался массив`);
    else heights.forEach((h, i) => checkInteger(h, `${path}.shelf_heights_mm[${i}]`, issues, 50, 3000));
  }
  if (issues.some((issue) => issue.startsWith(path))) return null;
  return {
    id: value.id as string,
    ...(value.label !== undefined ? { label: value.label as string } : {}),
    width_mm: value.width_mm as number,
    depth_mm: value.depth_mm as number,
    height_mm: value.height_mm as number,
    shelf_count: value.shelf_count as number,
    mount: value.mount as MountType,
    ...(heights !== undefined ? { shelf_heights_mm: heights as number[] } : {}),
  };
}

function parseSkuFacing(value: unknown, index: number, issues: string[]): SkuFacing | null {
  const path = `sku_facings[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${path}: ожидался объект`);
    return null;
  }
  checkKeys(value, SKU_FACING_KEYS, path, issues);
  checkString(value.sku, `${path}.sku`, issues);
  checkString(value.name, `${path}.name`, issues, { optional: true });
  checkString(value.image_url, `${path}.image_url`, issues, { minLength: 0, optional: true });
  checkString(value.shelf_unit_id, `${path}.shelf_unit_id`, issues);
  checkInteger(value.shelf_no, `${path}.shelf_no`, issues, 1, Number.MAX_SAFE_INTEGER);
  checkInteger(value.x_mm, `${path}.x_mm`, issues, 0, Number.MAX_SAFE_INTEGER);
  checkInteger(value.width_mm, `${path}.width_mm`, issues, 10, 1000);
  checkInteger(value.height_mm, `${path}.height_mm`, issues, 10, 1000);
  checkInteger(value.facings, `${path}.facings`, issues, 1, 99);
  if (issues.some((issue) => issue.startsWith(path))) return null;
  return {
    sku: value.sku as string,
    ...(value.name !== undefined ? { name: value.name as string } : {}),
    ...(value.image_url !== undefined ? { image_url: value.image_url as string } : {}),
    shelf_unit_id: value.shelf_unit_id as string,
    shelf_no: value.shelf_no as number,
    x_mm: value.x_mm as number,
    width_mm: value.width_mm as number,
    height_mm: value.height_mm as number,
    facings: value.facings as number,
  };
}

/** Parse + validate a planogram (JSON string or already-parsed object). */
export function parsePlanogram(input: string | unknown): Planogram {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (error) {
      throw new PlanogramParseError([`некорректный JSON: ${String(error)}`]);
    }
  }
  const issues: string[] = [];
  if (!isRecord(raw)) throw new PlanogramParseError(['корень: ожидался объект']);

  const record = raw;
  checkKeys(record, PLANOGRAM_KEYS, '', issues);
  if (record.version !== 1) issues.push('version: ожидалось 1');
  if (record.unit !== 'mm') issues.push('unit: ожидалось "mm"');
  checkString(record.name, 'name', issues, { maxLength: 200 });
  checkString(record.category, 'category', issues, { maxLength: 200 });
  checkString(record.store_format, 'store_format', issues, { maxLength: 50 });
  checkString(record.created_at, 'created_at', issues, { optional: true });
  if (record.promo_mode !== undefined && typeof record.promo_mode !== 'boolean') {
    issues.push('promo_mode: ожидался boolean');
  }
  if (!Array.isArray(record.shelf_units)) issues.push('shelf_units: ожидался массив');
  else if (record.shelf_units.length < 1) issues.push('shelf_units: minItems = 1');
  if (record.sku_facings !== undefined && !Array.isArray(record.sku_facings)) {
    issues.push('sku_facings: ожидался массив');
  }

  let shelfUnits: ShelfUnit[] = [];
  if (Array.isArray(record.shelf_units)) {
    shelfUnits = record.shelf_units
      .map((unit, index) => parseShelfUnit(unit, index, issues))
      .filter((unit): unit is ShelfUnit => unit !== null);
  }
  let facings: SkuFacing[] = [];
  if (Array.isArray(record.sku_facings)) {
    facings = record.sku_facings
      .map((facing, index) => parseSkuFacing(facing, index, issues))
      .filter((facing): facing is SkuFacing => facing !== null);
  }

  if (issues.length > 0) throw new PlanogramParseError(issues);

  return {
    version: 1,
    unit: 'mm',
    name: record.name as string,
    category: record.category as string,
    store_format: record.store_format as string,
    ...(record.created_at !== undefined ? { created_at: record.created_at as string } : {}),
    ...(record.promo_mode !== undefined ? { promo_mode: record.promo_mode as boolean } : {}),
    shelf_units: shelfUnits,
    sku_facings: facings,
  };
}

function pickOrdered(source: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Serialize in canonical key order; `undefined` optional fields are omitted. */
export function serializePlanogram(planogram: Planogram): string {
  const ordered: Record<string, unknown> = {
    ...pickOrdered(planogram, PLANOGRAM_KEYS),
    shelf_units: planogram.shelf_units.map((unit) => pickOrdered(unit, SHELF_UNIT_KEYS)),
    sku_facings: planogram.sku_facings.map((facing) => pickOrdered(facing, SKU_FACING_KEYS)),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Recursively sort keys so comparison is independent of key order. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) continue;
      out[key] = canonicalize(child);
    }
    return out;
  }
  return value;
}

/** Semantic deepEqual: key order and JSON formatting are irrelevant. */
export function semanticEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/**
 * Editor model — what the canvas holds while editing. Phase 2 edits the retail
 * document directly, so the model is the planogram plus the promo (snap) flag.
 */
export interface PlanogramEditorModel {
  planogram: Planogram;
  /** «Акция 10 см»: 100 mm snap grid instead of millimetre edge-to-edge. */
  promoMode: boolean;
}

export function toEditorModel(planogram: Planogram, promoMode = Boolean(planogram.promo_mode)): PlanogramEditorModel {
  return { planogram, promoMode };
}

/** Editor model → JSON-ready planogram (promo flag folded back into the document). */
export function fromEditorModel(model: PlanogramEditorModel): Planogram {
  return { ...model.planogram, promo_mode: model.promoMode };
}

/** JSON → editor → JSON, with the semantic-deepEqual verdict. */
export function roundTripPlanogram(json: string): { planogram: Planogram; json: string; equal: boolean } {
  const planogram = parsePlanogram(json);
  const model = toEditorModel(planogram);
  const reserialized = serializePlanogram(fromEditorModel(model));
  return {
    planogram,
    json: reserialized,
    equal: semanticEqual(parsePlanogram(reserialized), fromEditorModel(model)),
  };
}
