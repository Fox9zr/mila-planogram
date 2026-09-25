/** Типы планограммы Mila — соответствуют schema/planogram.schema.json (v1, unit=mm). */
export type MountType = 'shelf' | 'hook';

export interface ShelfUnit {
  id: string;
  label?: string;
  width_mm: number;   // 300..3000
  depth_mm: number;   // 200..1200
  height_mm: number;  // 1000..3000
  shelf_count: number; // 1..10
  mount: MountType;
  shelf_heights_mm?: number[]; // от пола; пусто = равномерно
}

export interface SkuFacing {
  sku: string;
  name?: string;
  image_url?: string;
  shelf_unit_id: string;
  shelf_no: number;   // 1..shelf_count
  x_mm: number;       // от левого края полки
  width_mm: number;   // ширина упаковки 10..1000
  height_mm: number;  // высота упаковки 10..1000
  facings: number;    // количество упаковок подряд 1..99
}

export interface Planogram {
  version: 1;
  unit: 'mm';
  name: string;
  category: string;
  store_format: string;
  created_at?: string;
  promo_mode?: boolean;
  shelf_units: ShelfUnit[];
  sku_facings: SkuFacing[];
}
