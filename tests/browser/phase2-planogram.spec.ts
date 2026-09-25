import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Phase 2 regression guard: the Phase 0 fixture opens in the retail editor, the
// shelf unit and its facings render, dragging snaps in millimetres (and clamps
// with a red frame + tooltip), the promo toggle switches to a 100 mm grid, and
// the document round-trips through JSON without a single console error.
const fixtureText = readFileSync(
  fileURLToPath(new URL('../../fixtures/planogram-soap.json', import.meta.url)),
  'utf-8',
);

test('Phase 2 planogram: fixture opens, rack + facings render, mm snap, clamp, round-trip', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/planogram?fixture=soap');

  // ── 2.1 ShelfUnit render ────────────────────────────────────────────────
  const rack = page.getByTestId('shelf-unit');
  await expect(rack).toHaveCount(1);
  await expect(rack).toHaveAttribute('data-mount', 'shelf');
  await expect(rack).toHaveAttribute('data-width-mm', '900');
  await expect(rack).toHaveAttribute('data-height-mm', '1800');
  await expect(page.getByTestId('shelf-deck')).toHaveCount(5);

  // ── 2.2 SkuFacing render + placeholder guard ────────────────────────────
  await expect(page.getByTestId('sku-facing')).toHaveCount(4);
  const facing1 = page.locator('[data-testid="sku-facing"][data-sku="SYN-0001"]');
  await expect(facing1).toHaveAttribute('data-x-mm', '0');
  await expect(facing1).toHaveAttribute('data-end-mm', '180');
  // image_url is empty in the fixture, so the SKU placeholder must be drawn
  await expect(facing1.getByTestId('facing-placeholder')).toBeVisible();
  await expect(facing1.getByTestId('facing-placeholder')).toContainText('SYN-0001');
  await expect(facing1.getByTestId('facing-image')).toHaveCount(0);
  await expect(page.getByTestId('violation-count')).toHaveAttribute('data-count', '0');

  // ── 2.3 drag: mm edge-to-edge snap + clamp with red frame and tooltip ───
  const gel = page.locator('[data-testid="sku-facing"][data-sku="SYN-0003"]');
  const gelRect = gel.getByTestId('facing-rect');
  const box = (await gelRect.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 800, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  // clamped to the left shelf edge and visibly flagged, not silently moved
  await expect(gel).toHaveAttribute('data-x-mm', '0');
  await expect(gel).toHaveAttribute('data-invalid', 'true');
  await expect(gel.getByTestId('bounds-tooltip')).toBeVisible();
  await expect(gel.getByTestId('bounds-tooltip')).toContainText('край полки');
  await expect(page.getByTestId('snap-last')).toContainText('мм');

  // drag one shelf-1 pack so it snaps edge-to-edge to SYN-0002 (x = 180 → 250)
  const facing2 = page.locator('[data-testid="sku-facing"][data-sku="SYN-0002"]');
  const box2 = (await facing2.getByTestId('facing-rect').boundingBox())!;
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await page.mouse.down();
  await page.mouse.move(box2.x + box2.width / 2 + 4, box2.y + box2.height / 2, { steps: 4 });
  await page.mouse.up();
  // a tiny move snaps back into the neighbour edge set, staying integral mm
  const snappedX = Number(await facing2.getAttribute('data-x-mm'));
  expect(Number.isInteger(snappedX)).toBe(true);
  expect([180, 250, 0, 60, 900]).toContain(snappedX);

  // ── 2.3 promo mode: 100 mm grid ─────────────────────────────────────────
  await page.getByTestId('promo-toggle').check();
  await expect(page.getByTestId('snap-mode')).toContainText('сетка 100 мм');
  const gelRect2 = (await gel.getByTestId('facing-rect').boundingBox())!;
  await page.mouse.move(gelRect2.x + gelRect2.width / 2, gelRect2.y + gelRect2.height / 2);
  await page.mouse.down();
  await page.mouse.move(gelRect2.x + gelRect2.width / 2 + 120, gelRect2.y + gelRect2.height / 2, { steps: 8 });
  await page.mouse.up();
  const promoX = Number(await gel.getAttribute('data-x-mm'));
  expect(promoX % 100).toBe(0);
  await expect(page.getByTestId('snap-last')).toContainText('сетка 100 мм');
  await page.getByTestId('promo-toggle').uncheck();

  // ── 2.5 out-of-shelf x → bounds violation (red frame + tooltip) ─────────
  await facing1.getByTestId('facing-rect').click();
  await page.getByTestId('facing-x-input').fill('880');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('violation-count')).toHaveAttribute('data-count', '1');
  await expect(facing1).toHaveAttribute('data-invalid', 'true');
  await expect(facing1).toHaveAttribute('data-end-mm', '1060');
  await expect(facing1.getByTestId('bounds-tooltip')).toContainText('1060');

  // ── 2.4 serialization: editor → JSON ────────────────────────────────────
  await expect(page.getByTestId('roundtrip-status')).toHaveAttribute('data-ok', 'true');
  await page.getByTestId('save-json').click();
  const json = await page.getByTestId('planogram-json').innerText();
  const saved = JSON.parse(json);
  expect(saved.version).toBe(1);
  expect(saved.unit).toBe('mm');
  expect(saved.sku_facings).toHaveLength(4);
  expect(saved.sku_facings.find((f: { sku: string }) => f.sku === 'SYN-0001').x_mm).toBe(880);

  // ── 2.4 JSON → editor: the untouched fixture comes back clean ───────────
  await page.getByTestId('planogram-json-input').fill(fixtureText);
  await page.getByTestId('load-json').click();
  await expect(page.getByTestId('violation-count')).toHaveAttribute('data-count', '0');
  await expect(page.locator('[data-testid="sku-facing"][data-sku="SYN-0001"]'))
    .toHaveAttribute('data-x-mm', '0');
  await expect(page.getByTestId('json-error')).toHaveCount(0);

  // a broken document must be rejected with the schema issues, not crash
  await page.getByTestId('planogram-json-input').fill('{"version":1,"unit":"cm"}');
  await page.getByTestId('load-json').click();
  await expect(page.getByTestId('json-error')).toBeVisible();
  await expect(page.getByTestId('sku-facing')).toHaveCount(4);

  expect(errors).toEqual([]);
});

test('Phase 2 planogram: empty fixture renders the rack with zero facings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/planogram?fixture=empty');
  await expect(page.getByTestId('shelf-unit')).toHaveCount(1);
  await expect(page.getByTestId('shelf-deck')).toHaveCount(5);
  await expect(page.getByTestId('sku-facing')).toHaveCount(0);
  await expect(page.getByTestId('facing-inspector-empty')).toBeVisible();
  expect(errors).toEqual([]);
});
