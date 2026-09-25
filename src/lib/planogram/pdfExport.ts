/**
 * Phase 3.1 — PDF-экспорт планограммы (категория × формат, дата) на jsPDF.
 *
 * Что попадает в документ:
 *   - титульный блок: имя планограммы, «категория × формат магазина», дата, итоги
 *     (стеллажи / фейсинги / SKU / нарушения границ);
 *   - боковая проекция каждого стеллажа в масштабе (мм документа → мм бумаги),
 *     с полками и фейсингами, подписанными SKU-кодом;
 *   - таблица фейсингов (SKU, наименование, полка, x, габарит, высота, фейсингов).
 *
 * Кириллица: стандартные шрифты jsPDF (helvetica/WinAnsi) не содержат
 * кириллических глифов, поэтому при экспорте подключается урезанный
 * DejaVuSans (`static/fonts/DejaVuSans.ttf`, subset Latin+Cyrillic, ~48 КБ).
 * Если шрифт недоступен (unit-тесты, оффлайн), текст автоматически уходит в
 * ASCII-транслитерацию — документ остаётся читаемым, но это деградация, о
 * которой сообщает флаг `fontEmbedded: false`.
 */
import jsPDF from 'jspdf';
import type { Planogram } from './types';
import { DECK_MM, POST_MM, RACK_GAP_MM, facingsOnShelf, facingSpanMm, shelfHeights } from './geometry';
import { validatePlanogramBounds } from './validateBounds';

/** Имя семейства, под которым регистрируется кириллический шрифт в документе. */
export const CYRILLIC_FONT_FAMILY = 'PlanogramSans';
/** Статический ассет с урезанным DejaVuSans (subset Latin+Cyrillic). */
export const CYRILLIC_FONT_URL = '/fonts/DejaVuSans.ttf';
const LATIN_FONT_FAMILY = 'helvetica';

/** Горизонтальный зазор между стеллажами — см. geometry.RACK_GAP_MM. */

export type PlanogramPdfOrientation = 'landscape' | 'portrait';
export type PlanogramPdfFormat = 'a4' | 'a3';

export interface PlanogramPdfOptions {
  /** Дата документа; по умолчанию — текущая. Строка передаётся как есть (ISO). */
  date?: Date | string;
  /** base64 TTF для кириллицы. null/undefined → ASCII-транслитерация. */
  fontBase64?: string | null;
  orientation?: PlanogramPdfOrientation;
  format?: PlanogramPdfFormat;
}

export interface PlanogramPdfResult {
  pdf: jsPDF;
  filename: string;
  /** true, когда в документ встроен кириллический шрифт (текст без транслитерации). */
  fontEmbedded: boolean;
  /** Итоги, попавшие в титульный блок — те же числа проверяются в тестах. */
  totals: PlanogramPdfTotals;
}

export interface PlanogramPdfTotals {
  racks: number;
  facings: number;
  skus: number;
  violations: number;
  shelf_slots: number;
}

export function planogramTotals(planogram: Planogram): PlanogramPdfTotals {
  const skus = new Set(planogram.sku_facings.map((f) => f.sku));
  return {
    racks: planogram.shelf_units.length,
    facings: planogram.sku_facings.reduce((sum, f) => sum + f.facings, 0),
    skus: skus.size,
    violations: validatePlanogramBounds(planogram).length,
    shelf_slots: planogram.shelf_units.reduce((sum, u) => sum + u.shelf_count, 0),
  };
}

/** ASCII-транслитерация — запасной путь, когда кириллический шрифт не подключён. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z', И: 'I',
  Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  У: 'U', Ф: 'F', Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Shch', Ъ: '', Ы: 'Y',
  Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
  '×': 'x', '—': '-', '–': '-', '«': '"', '»': '"', '№': 'N', '·': '.', '→': '->',
};

export function transliterateAscii(value: string): string {
  let out = '';
  for (const char of value) {
    if (Object.prototype.hasOwnProperty.call(TRANSLIT, char)) out += TRANSLIT[char];
    else if (char.charCodeAt(0) < 128) out += char;
    else out += '?';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Имя скачиваемого файла: Планограмма_<категория>_<формат>_<дата>.pdf */
export function planogramPdfFilename(planogram: Planogram, date: Date | string = new Date()): string {
  const stamp = isoDate(date);
  const safe = (value: string) =>
    value
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  const parts = ['Планограмма', safe(planogram.category) || 'без_категории', safe(planogram.store_format) || 'формат', stamp];
  return `${parts.join('_')}.pdf`;
}

export function isoDate(date: Date | string): string {
  if (typeof date === 'string') {
    const match = date.match(/\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    return date;
  }
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Читает subset-шрифт и отдаёт base64; null, если ассет недоступен. */
export async function loadPlanogramCyrillicFont(
  fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): Promise<string | null> {
  if (!fetchImpl) return null;
  try {
    const response = await fetchImpl(CYRILLIC_FONT_URL);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = typeof btoa === 'function' ? btoa(binary) : null;
    return base64;
  } catch {
    return null;
  }
}

function registerFont(pdf: jsPDF, fontBase64: string): void {
  pdf.addFileToVFS('DejaVuSans.ttf', fontBase64);
  pdf.addFont('DejaVuSans.ttf', CYRILLIC_FONT_FAMILY, 'normal');
}

/** Строит PDF-документ планограммы. Никаких обращений к DOM — пригоден для unit-тестов. */
export function buildPlanogramPdf(planogram: Planogram, options: PlanogramPdfOptions = {}): PlanogramPdfResult {
  const date = options.date ?? new Date();
  const orientation = options.orientation ?? 'landscape';
  const format = options.format ?? 'a4';
  const fontEmbedded = Boolean(options.fontBase64);
  const filename = planogramPdfFilename(planogram, date);

  const pdf = new jsPDF({ orientation, unit: 'mm', format });
  if (options.fontBase64) registerFont(pdf, options.fontBase64);

  const family = fontEmbedded ? CYRILLIC_FONT_FAMILY : LATIN_FONT_FAMILY;
  /** Единая точка входа для текста: транслитерация, если шрифт не встроен. */
  const T = (value: string): string => (fontEmbedded ? value : transliterateAscii(value));

  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pw - margin * 2;
  const totals = planogramTotals(planogram);
  const stamp = isoDate(date);

  // ── Титульный блок ───────────────────────────────────────────────────────
  const titleH = 22;
  pdf.setDrawColor(40);
  pdf.setLineWidth(0.4);
  pdf.rect(margin, margin, contentW, titleH);

  pdf.setFont(family, 'normal');
  pdf.setFontSize(13);
  pdf.text(T(planogram.name), margin + 3, margin + 7);

  pdf.setFontSize(10);
  pdf.text(T(`${planogram.category} × ${planogram.store_format}`), margin + 3, margin + 13);

  pdf.setFontSize(8);
  pdf.text(
    T(`Единицы: ${planogram.unit} · Акция 10 см: ${planogram.promo_mode ? 'да' : 'нет'} · Версия схемы: ${planogram.version}`),
    margin + 3,
    margin + 18.5,
  );

  pdf.setFontSize(9);
  pdf.text(T(`Дата: ${stamp}`), margin + contentW * 0.62, margin + 7);
  pdf.setFontSize(8);
  pdf.text(
    T(`Стеллажи: ${totals.racks} · Полки: ${totals.shelf_slots} · Фейсинги: ${totals.facings} · SKU: ${totals.skus}`),
    margin + contentW * 0.62,
    margin + 13,
  );
  pdf.text(
    T(`Нарушений границ полки: ${totals.violations}`),
    margin + contentW * 0.62,
    margin + 18.5,
  );

  // ── Боковая проекция стеллажей ───────────────────────────────────────────
  let y = margin + titleH + 8;
  const drawingH = Math.min(105, ph - y - 70);
  const totalDocW = planogram.shelf_units.reduce((sum, u) => sum + u.width_mm, 0)
    + RACK_GAP_MM * Math.max(0, planogram.shelf_units.length - 1);
  const maxHeightMm = planogram.shelf_units.reduce((max, u) => Math.max(max, u.height_mm), 1000);
  const scale = Math.min(contentW / Math.max(1, totalDocW), drawingH / Math.max(1, maxHeightMm));

  pdf.setFontSize(9);
  pdf.text(T('Боковая проекция (вид на стеллаж)'), margin, y);
  y += 4;

  const baseline = y + drawingH;
  const METER = 1000;
  const barMm = 500 * scale;
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(120);
  pdf.line(margin, baseline + 8, margin + barMm, baseline + 8);
  pdf.line(margin, baseline + 6.5, margin, baseline + 9.5);
  pdf.line(margin + barMm, baseline + 6.5, margin + barMm, baseline + 9.5);
  pdf.setFontSize(7);
  pdf.text(T('0,5 м'), margin + barMm + 1.5, baseline + 9);
  pdf.setFontSize(9);

  pdf.setLineWidth(0.3);
  let cursorX = margin;
  for (const unit of planogram.shelf_units) {
    const unitX = cursorX;
    const unitW = unit.width_mm * scale;
    const unitH = unit.height_mm * scale;
    const postW = Math.max(0.4, POST_MM * scale);
    const deckH = Math.max(0.3, DECK_MM * scale);

    // Стойки
    pdf.setFillColor(203, 213, 225);
    pdf.setDrawColor(100, 116, 139);
    pdf.rect(unitX, baseline - unitH, postW, unitH, 'FD');
    pdf.rect(unitX + unitW - postW, baseline - unitH, postW, unitH, 'FD');

    const innerX = unitX + postW;
    const innerW = Math.max(0, unitW - postW * 2);
    const levels = shelfHeights(unit);

    levels.forEach((level, index) => {
      const deckY = baseline - level * scale;
      if (unit.mount === 'hook') {
        pdf.setDrawColor(100, 116, 139);
        pdf.setLineWidth(0.5);
        pdf.setLineDashPattern([1.2, 0.8], 0);
        pdf.line(innerX, deckY, innerX + innerW, deckY);
        pdf.setLineDashPattern([], 0);
        pdf.setLineWidth(0.3);
      } else {
        pdf.setFillColor(226, 232, 240);
        pdf.setDrawColor(100, 116, 139);
        pdf.rect(innerX, deckY, innerW, deckH, 'FD');
      }

      // Фейсинги полки
      for (const facing of facingsOnShelf(planogram.sku_facings, unit.id, index + 1)) {
        const fx = unitX + facing.x_mm * scale;
        const fw = Math.max(0.4, facingSpanMm(facing) * scale);
        const fh = Math.max(0.4, facing.height_mm * scale);
        const fy = baseline - (level + facing.height_mm) * scale;
        const off = validatePlanogramBounds(planogram).some(
          (v) => v.sku === facing.sku && v.shelf_unit_id === unit.id && v.reason === 'out_of_shelf',
        );
        if (off) {
          pdf.setFillColor(254, 226, 226);
          pdf.setDrawColor(220, 38, 38);
        } else {
          pdf.setFillColor(219, 234, 254);
          pdf.setDrawColor(37, 99, 235);
        }
        pdf.setLineWidth(0.25);
        pdf.rect(fx, fy, fw, fh, 'FD');

        // Подпись SKU — только если прямоугольник это выдержит.
        if (fw > 9 && fh > 2.6) {
          pdf.setFontSize(Math.max(4.5, Math.min(7, fh * 1.1)));
          pdf.setTextColor(30, 41, 59);
          pdf.text(T(facing.sku), fx + fw / 2, fy + fh / 2 + 0.8, { align: 'center' });
        }
      }
    });

    // Подпись стеллажа и осевая линия пола
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(7);
    pdf.setDrawColor(51, 65, 85);
    pdf.setLineWidth(0.5);
    pdf.line(unitX - 1, baseline, unitX + unitW + 1, baseline);
    pdf.text(
      T(`${unit.label ? `${unit.label}: ` : ''}${unit.width_mm}×${unit.depth_mm}×${unit.height_mm} мм · ${unit.shelf_count} · ${unit.mount === 'hook' ? 'крючки' : 'полки'}`),
      unitX,
      baseline - unitH - 1.5,
    );
    cursorX += unit.width_mm * scale + RACK_GAP_MM * scale;
  }

  // ── Таблица фейсингов ────────────────────────────────────────────────────
  y = baseline + 14;
  const columns = [
    { title: 'SKU', width: 30, align: 'left' as const },
    { title: 'Наименование', width: 66, align: 'left' as const },
    { title: 'Полка', width: 14, align: 'right' as const },
    { title: 'x, мм', width: 18, align: 'right' as const },
    { title: 'Габарит, мм', width: 24, align: 'right' as const },
    { title: 'Высота, мм', width: 22, align: 'right' as const },
    { title: 'Фейсингов', width: 20, align: 'right' as const },
  ];
  const tableW = columns.reduce((sum, c) => sum + c.width, 0);
  pdf.setFontSize(8);

  const drawTableHeader = () => {
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.2);
    pdf.rect(margin, y - 4, tableW, 5.5, 'FD');
    pdf.setTextColor(51, 65, 85);
    let x = margin;
    for (const column of columns) {
      const tx = column.align === 'right' ? x + column.width - 1.5 : x + 1.5;
      pdf.text(T(column.title), tx, y, { align: column.align });
      x += column.width;
    }
    y += 4.6;
  };

  pdf.setTextColor(15, 23, 42);
  drawTableHeader();

  for (const facing of planogram.sku_facings) {
    if (y > ph - margin - 8) {
      pdf.addPage();
      y = margin + 6;
      drawTableHeader();
    }
    const cells = [
      facing.sku,
      facing.name ?? '—',
      `${facing.shelf_no}`,
      `${facing.x_mm}`,
      `${facingSpanMm(facing)}`,
      `${facing.height_mm}`,
      `${facing.facings}`,
    ];
    let x = margin;
    cells.forEach((cell, index) => {
      const column = columns[index];
      const text = T(index === 1 ? truncate(cell, 42) : cell);
      const tx = column.align === 'right' ? x + column.width - 1.5 : x + 1.5;
      pdf.text(text, tx, y, { align: column.align });
      x += column.width;
    });
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.1);
    pdf.line(margin, y + 1.4, margin + tableW, y + 1.4);
    y += 4.4;
  }

  // ── Подвал ───────────────────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      T(`Сформировано: ${stamp} · mila-planogram (форк openPlan3D) · стр. ${page} из ${pages}`),
      margin,
      ph - margin + 4,
    );
    pdf.setTextColor(15, 23, 42);
  }
  pdf.setPage(1);

  return { pdf, filename, fontEmbedded, totals };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Экспорт: собирает PDF (с кириллическим шрифтом, если ассет доступен),
 * отдаёт файл браузеру и возвращает метаданные, которые UI показывает в статусе.
 */
export async function exportPlanogramPDF(
  planogram: Planogram,
  options: PlanogramPdfOptions = {},
): Promise<{ filename: string; bytes: number; fontEmbedded: boolean; totals: PlanogramPdfTotals }> {
  let fontBase64 = options.fontBase64 ?? null;
  if (fontBase64 === null) fontBase64 = await loadPlanogramCyrillicFont();
  const { pdf, filename, fontEmbedded, totals } = buildPlanogramPdf(planogram, { ...options, fontBase64 });
  const output = pdf.output() as unknown;
  const bytes = typeof output === 'string' ? output.length : (output as ArrayBuffer).byteLength;
  pdf.save(filename);
  return { filename, bytes, fontEmbedded, totals };
}
