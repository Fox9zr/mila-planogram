import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Phase 3 regression guard: the soap fixture exports a real PDF (category ×
// store format + date, Cyrillic font embedded) and the same document renders as
// a Three.js 3D preview of the shelf unit. Zero console errors throughout.
test('Phase 3 planogram: PDF-экспорт и 3D-превью', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/planogram?fixture=soap');

  // ── 3.1 PDF-экспорт ─────────────────────────────────────────────────────
  const pending = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  const status = page.getByTestId('pdf-status');
  await expect(status).toHaveAttribute('data-state', 'ok');

  const filename = (await status.getAttribute('data-filename'))!;
  // категория × формат × дата — как в ТЗ БП Mila
  expect(filename).toMatch(/^Планограмма_Мыло_Дроггери_\d{4}-\d{2}-\d{2}\.pdf$/);

  const download = await pending;
  expect(download.suggestedFilename()).toBe(filename);
  const pdfPath = (await download.path())!;
  const bytes = await readFile(pdfPath);

  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(bytes.subarray(-6).toString('latin1')).toContain('%%EOF');
  expect(bytes.byteLength).toBeGreaterThan(5000);
  // кириллический subset-шрифт действительно встроен → текст не ASCII-заглушка
  expect(bytes.toString('latin1')).toContain('/FontFile2');
  await expect(status).toHaveAttribute('data-font-embedded', 'true');
  const reported = Number(await status.getAttribute('data-bytes'));
  expect(reported).toBeGreaterThan(2000);
  expect(Math.abs(reported - bytes.byteLength)).toBeLessThan(2000);

  // ── 3.2 3D-превью стеллажа ──────────────────────────────────────────────
  await page.getByTestId('view-3d').click();
  const viewer = page.getByTestId('planogram-3d');
  await expect(viewer).toBeVisible();
  const stage = viewer.locator('.stage');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  // 1 стеллаж: 2 стойки + 5 полок + 4 фейсинга = 11 объектов
  await expect(stage).toHaveAttribute('data-box-count', '11');
  await expect(stage).toHaveAttribute('data-racks', '1');
  await expect(stage).toHaveAttribute('data-facings', '11');
  await expect(page.getByTestId('planogram-3d-status')).toContainText('объектов: 11');
  await expect(page.getByTestId('planogram-3d-legend-item')).toHaveCount(4);
  await expect(page.getByTestId('planogram-3d-legend-item').first()).toHaveAttribute('data-sku', 'SYN-0001');

  const canvas = page.getByTestId('planogram-3d-canvas');
  await expect(canvas).toBeVisible();
  const canvasBox = (await canvas.boundingBox())!;
  expect(canvasBox.width).toBeGreaterThan(300);
  expect(canvasBox.height).toBeGreaterThan(300);

  // Кадр действительно отрисован: непустой PNG (одноцветная заглушка была бы ~1 КБ).
  const snapshot = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL('image/png'));
  expect(snapshot.startsWith('data:image/png;base64,')).toBe(true);
  expect(snapshot.length).toBeGreaterThan(3000);

  const pngDownload = page.waitForEvent('download');
  await page.getByTestId('planogram-3d-png').click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toBe('planogram-3d.png');
  const pngBytes = await readFile((await png.path())!);
  expect(pngBytes.byteLength).toBeGreaterThan(2048);

  // Сброс вида не ломает сцену.
  await page.getByTestId('planogram-3d-reset').click();
  await expect(stage).toHaveAttribute('data-ready', 'true');

  // ── Возврат в 2D: редактор жив, документ не потерян ─────────────────────
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId('planogram-canvas')).toBeVisible();
  await expect(page.getByTestId('violation-count')).toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('roundtrip-status')).toHaveAttribute('data-ok', 'true');

  expect(errors).toEqual([]);
});

test('Phase 3 planogram: пустая планограмма экспортирует PDF без SKU и 3D без фейсингов', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/planogram?fixture=empty');

  const pending = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  await expect(page.getByTestId('pdf-status')).toHaveAttribute('data-state', 'ok');
  const bytes = await readFile((await (await pending).path())!);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  await page.getByTestId('view-3d').click();
  const stage = page.getByTestId('planogram-3d').locator('.stage');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  // пустая планограмма: только стойки и полки, ни одного фейсинга
  await expect(stage).toHaveAttribute('data-facings', '0');
  await expect(page.getByTestId('planogram-3d-legend-item')).toHaveCount(0);
  expect(errors).toEqual([]);
});
