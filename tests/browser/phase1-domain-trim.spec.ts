import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Phase 1 regression guard: residential tools are gone, the Mila rack catalog is
// placeable, the Russian toolbar renders, and nothing logs a console error.
test('Phase 1 domain trim: RU toolbar, no residential tools, Mila rack placement, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem('hasSeenWelcome', 'true');
    localStorage.setItem('o3d_locale', 'ru');
  });
  await page.goto('/editor');

  // Russian toolbar and menus.
  await expect(page.getByRole('button', { name: 'Экспорт', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();

  // Residential authoring tools must not be reachable.
  await expect(page.getByRole('button', { name: /Нарисовать стену/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Добавить лестницу/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Импорт RoomPlan/ })).toHaveCount(0);
  await expect(page.getByText('Двери', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Окна', { exact: true })).toHaveCount(0);

  // The 'D' hotkey no longer arms the door tool (the tool itself is gone).
  await page.keyboard.press('d');
  await expect(page.getByRole('button', { name: /Стеллажи Mila/ }).first()).toBeVisible();

  async function exported() {
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать JSON', exact: true }).click();
    const project = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
    return project.floors;
  }

  const before = await exported();
  await page.getByRole('button', { name: 'Объекты', exact: true }).click();
  await page.getByRole('button', { name: /Стеллаж Mila 900×400×1800/ }).first().click();
  const canvas = page.getByLabel('Floor plan editor canvas', { exact: true });
  await canvas.focus();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * .5, y: box.height * .5 } });
  await canvas.press('Escape');

  const placed = await exported();
  expect(placed[0].furniture).toHaveLength(before[0].furniture.length + 1);
  expect(placed[0].furniture.at(-1)).toMatchObject({ catalogId: 'mila_rack_900_400_1800', width: 90, height: 180 });

  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  expect(await exported()).toEqual(before);

  expect(errors).toEqual([]);
});
