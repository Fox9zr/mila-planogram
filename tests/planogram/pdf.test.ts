import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildPlanogramPdf,
  exportPlanogramPDF,
  isoDate,
  loadPlanogramCyrillicFont,
  planogramPdfFilename,
  planogramTotals,
  transliterateAscii,
  CYRILLIC_FONT_URL,
} from '../../src/lib/planogram/pdfExport';
import type { Planogram } from '../../src/lib/planogram/types';

// jsPDF строится настоящий (реальная кодировка/встраивание шрифта), перехватываем
// только скачивание файла — как в tests/pdf-library.test.ts.
const saved = vi.hoisted(() => ({ filenames: [] as string[] }));
vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>();
  return {
    default: class {
      constructor(options: ConstructorParameters<typeof actual.default>[0]) {
        const pdf = new actual.default(options);
        vi.spyOn(pdf, 'save').mockImplementation((filename = '') => {
          saved.filenames.push(filename);
          return pdf;
        });
        return pdf;
      }
    },
  };
});

function loadFixture(name: string): Planogram {
  return JSON.parse(readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8'));
}

const fontBase64 = readFileSync(resolve(__dirname, '../../static/fonts/DejaVuSans.ttf')).toString('base64');
const soap = loadFixture('planogram-soap.json');
const DATE = '2026-09-25';

describe('planogramTotals', () => {
  it('считает стеллажи, слоты полок, фейсинги, SKU и нарушения', () => {
    expect(planogramTotals(soap)).toEqual({
      racks: 1,
      shelf_slots: 5,
      facings: 11, // 3 + 2 + 4 + 2 фейсинга в soap-фикстуре
      skus: 4,
      violations: 0,
    });
  });
});

describe('planogramPdfFilename', () => {
  it('собирает имя из категории, формата и даты', () => {
    expect(planogramPdfFilename(soap, DATE)).toBe('Планограмма_Мыло_Дроггери_2026-09-25.pdf');
  });

  it('вычищает запрещённые в имени файла символы', () => {
    const dirty: Planogram = { ...soap, category: 'Мыло/Крем', store_format: 'Дроггери:экстра' };
    expect(planogramPdfFilename(dirty, DATE)).toBe('Планограмма_Мыло_Крем_Дроггери_экстра_2026-09-25.pdf');
  });

  it('isoDate принимает строку с временем и Date', () => {
    expect(isoDate('2026-09-25T12:00:00+03:00')).toBe('2026-09-25');
    expect(isoDate(new Date(2026, 8, 25))).toBe('2026-09-25');
  });
});

describe('transliterateAscii', () => {
  it('переводит кириллицу в ASCII и не трогает латиницу с цифрами', () => {
    expect(transliterateAscii('Мыло × Дроггери')).toBe('Mylo x Droggeri');
    expect(transliterateAscii('SYN-0001 90 г')).toBe('SYN-0001 90 g');
  });
});

describe('buildPlanogramPdf — без кириллического шрифта (ASCII-деградация)', () => {
  const { pdf, filename, fontEmbedded, totals } = buildPlanogramPdf(soap, { date: DATE });

  it('отдаёт валидный PDF-документ на одну страницу и файл с ожидаемым именем', () => {
    const output = pdf.output() as string;
    expect(output.startsWith('%PDF-1.')).toBe(true);
    expect(output).toContain('%%EOF');
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(filename).toBe('Планограмма_Мыло_Дроггери_2026-09-25.pdf');
    expect(fontEmbedded).toBe(false);
    expect(totals.violations).toBe(0);
  });

  it('титульный блок, дата и SKU попадают в текст (транслитом)', () => {
    const output = pdf.output() as string;
    expect(output).toContain('(Mylo x Droggeri)'); // категория × формат
    expect(output).toContain('(Test: Mylo, format Droggeri)'); // имя планограммы
    expect(output).toContain('(Data: 2026-09-25)');
    expect(output).toContain('(SYN-0001)');
    // Ключевые подписи таблицы и подвала
    expect(output).toContain('(Gabarit, mm)');
    expect(output).toContain('(Feysingov)');
  });

  it('не встраивает TTF, когда шрифт не передан', () => {
    expect((pdf.output() as string)).not.toContain('/FontFile2');
  });
});

describe('buildPlanogramPdf — со встроенным кириллическим шрифтом', () => {
  const { pdf, fontEmbedded } = buildPlanogramPdf(soap, { date: DATE, fontBase64 });

  it('встраивает subset DejaVuSans и пишет живой кириллицей', () => {
    const output = pdf.output() as string;
    expect(fontEmbedded).toBe(true);
    expect(output).toContain('/FontFile2');
    // Встроенный шрифт → текст пишется глифами в hex-строках, литералов нет:
    expect(output).not.toContain('(Mylo');
    expect(output).not.toContain('Drogge');
  });

  it('пометка о нарушении границ попадает в титульный блок', () => {
    const broken: Planogram = {
      ...soap,
      sku_facings: soap.sku_facings.map((f) => (f.sku === 'SYN-0001' ? { ...f, x_mm: 880 } : f)),
    };
    const totals = planogramTotals(broken);
    expect(totals.violations).toBe(1);
    const { pdf: brokenPdf } = buildPlanogramPdf(broken, { date: DATE, fontBase64 });
    expect(brokenPdf.getNumberOfPages()).toBe(1);
  });
});

describe('loadPlanogramCyrillicFont', () => {
  it('читает статический subset-шрифт и отдаёт base64', async () => {
    const fetchImpl = (async (url: string) => {
      expect(url).toBe(CYRILLIC_FONT_URL);
      const bytes = readFileSync(resolve(__dirname, '../../static/fonts/DejaVuSans.ttf'));
      return new Response(bytes, { status: 200 });
    }) as unknown as typeof fetch;
    const base64 = await loadPlanogramCyrillicFont(fetchImpl);
    expect(base64?.length).toBeGreaterThan(1000);
    expect(base64).toBe(fontBase64);
  });

  it('возвращает null при 404 и при отсутствии fetch', async () => {
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await loadPlanogramCyrillicFont(notFound)).toBeNull();
    expect(await loadPlanogramCyrillicFont(undefined)).toBeNull();
  });
});

describe('exportPlanogramPDF', () => {
  it('сохраняет файл под именем схемы и возвращает метаданные', async () => {
    saved.filenames.length = 0;
    const result = await exportPlanogramPDF(soap, { date: DATE, fontBase64 });
    expect(saved.filenames).toEqual(['Планограмма_Мыло_Дроггери_2026-09-25.pdf']);
    expect(result.filename).toBe('Планограмма_Мыло_Дроггери_2026-09-25.pdf');
    expect(result.fontEmbedded).toBe(true);
    expect(result.bytes).toBeGreaterThan(5000); // встроенный subset-шрифт
    expect(result.totals).toEqual(planogramTotals(soap));
  });

  it('деградирует до ASCII, когда кириллический шрифт недоступен', async () => {
    saved.filenames.length = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const result = await exportPlanogramPDF(soap, { date: DATE });
    expect(fetchSpy).toHaveBeenCalledWith(CYRILLIC_FONT_URL);
    expect(result.fontEmbedded).toBe(false);
    expect(saved.filenames).toEqual(['Планограмма_Мыло_Дроггери_2026-09-25.pdf']);
  });
});
