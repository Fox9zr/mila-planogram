import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FACING_PALETTE,
  MM_TO_SCENE,
  framingDistance,
  planogramScene,
  rackPlacements,
  sceneBounds,
} from '../../src/lib/planogram/viewer3dGeometry';
import { DECK_MM, HOOK_RAIL_MM, POST_MM, RACK_GAP_MM } from '../../src/lib/planogram/geometry';
import type { Planogram } from '../../src/lib/planogram/types';

function loadFixture(name: string): Planogram {
  return JSON.parse(readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8'));
}

const soap = loadFixture('planogram-soap.json');
const empty = loadFixture('planogram-empty.json');
const approx = (value: number, expected: number, tolerance = 1e-9) =>
  expect(Math.abs(value - expected)).toBeLessThanOrEqual(tolerance);

describe('rackPlacements', () => {
  it('раскладывает стеллажи слева направо с зазором RACK_GAP_MM', () => {
    const two: Planogram = {
      ...soap,
      shelf_units: [
        { ...soap.shelf_units[0], id: 'a', width_mm: 900 },
        { ...soap.shelf_units[0], id: 'b', width_mm: 600 },
      ],
    };
    expect(rackPlacements(two)).toEqual([
      { id: 'a', x0_mm: 0 },
      { id: 'b', x0_mm: 900 + RACK_GAP_MM },
    ]);
  });
});

describe('planogramScene — soap fixture (полки)', () => {
  const scene = planogramScene(soap);

  it('строит по 2 стойки на стеллаж, 5 полок и 4 фейсинга', () => {
    const byKind = (kind: string) => scene.boxes.filter((b) => b.kind === kind);
    expect(scene.boxes).toHaveLength(11);
    expect(byKind('post')).toHaveLength(2);
    expect(byKind('deck')).toHaveLength(5);
    expect(byKind('facing')).toHaveLength(4);
    expect(scene.racks).toBe(1);
    expect(scene.facings).toBe(11);
    expect(scene.width_mm).toBe(900);
    expect(scene.height_mm).toBe(1800);
  });

  it('стойки стоят по краям, на всю высоту и глубину стеллажа', () => {
    const posts = scene.boxes.filter((b) => b.kind === 'post');
    const left = posts.find((p) => p.id.endsWith(':left'))!;
    const right = posts.find((p) => p.id.endsWith(':right'))!;
    approx(left.position[0], (POST_MM / 2) * MM_TO_SCENE);
    approx(right.position[0], (900 - POST_MM / 2) * MM_TO_SCENE);
    for (const post of posts) {
      approx(post.size[0], POST_MM * MM_TO_SCENE);
      approx(post.size[1], 1800 * MM_TO_SCENE);
      approx(post.size[2], 400 * MM_TO_SCENE);
      approx(post.position[1], 900 * MM_TO_SCENE);
    }
  });

  it('полки стоят на равных уровнях, шириной за вычетом стоек', () => {
    const decks = scene.boxes
      .filter((b) => b.kind === 'deck')
      .sort((a, b) => a.position[1] - b.position[1]);
    const levelsMm = [360, 720, 1080, 1440, 1800];
    decks.forEach((deck, index) => {
      approx(deck.position[1], levelsMm[index] * MM_TO_SCENE);
      approx(deck.size[0], (900 - POST_MM * 2) * MM_TO_SCENE);
      approx(deck.size[1], DECK_MM * MM_TO_SCENE);
      approx(deck.position[0], (POST_MM + (900 - POST_MM * 2) / 2) * MM_TO_SCENE);
    });
  });

  it('фейсинг SYN-0001 (3 упаковки по 60 мм) стоит на 1-й полке над настилом', () => {
    const facing = scene.boxes.find((b) => b.sku === 'SYN-0001')!;
    expect(facing.shelf_no).toBe(1);
    approx(facing.size[0], 180 * MM_TO_SCENE);
    approx(facing.size[1], 120 * MM_TO_SCENE);
    // x_mm отсчитывается от левого края стеллажа — так же, как в 2D-редакторе.
    approx(facing.position[0], (180 / 2) * MM_TO_SCENE);
    approx(facing.position[1], (360 + DECK_MM + 120 / 2) * MM_TO_SCENE);
    expect(facing.color).toBe(FACING_PALETTE[0]);
  });

  it('фейсинг SYN-0003 (4 упаковки по 80 мм) — на 3-й полке, свой цвет', () => {
    const facing = scene.boxes.find((b) => b.sku === 'SYN-0003')!;
    expect(facing.shelf_no).toBe(3);
    approx(facing.size[0], 320 * MM_TO_SCENE);
    approx(facing.position[0], (100 + 320 / 2) * MM_TO_SCENE);
    approx(facing.position[1], (1080 + DECK_MM + 220 / 2) * MM_TO_SCENE);
    expect(facing.color).toBe(FACING_PALETTE[2]);
  });

  it('легенда перечисляет SKU без повторов и с теми же цветами', () => {
    expect(scene.legend.map((l) => l.sku)).toEqual(['SYN-0001', 'SYN-0002', 'SYN-0003', 'SYN-0004']);
    expect(scene.legend[0].color).toBe(FACING_PALETTE[0]);
    expect(scene.legend[0].name).toBe('Мыло детское 90г');
  });

  it('габариты сцены в метрах описывают стеллаж целиком', () => {
    approx(scene.bounds.min[0], 0);
    approx(scene.bounds.max[0], 0.9);
    // Верхняя полка стоит на уровне height_mm, поэтому фейсинг с неё (SYN-0004)
    // поднимает верхнюю границу сцены на свою высоту — как и в 2D-проекции.
    approx(scene.bounds.max[1], 1.97);
    approx(scene.bounds.max[2], 0.4);
    approx(scene.bounds.radius, Math.hypot(0.9, 1.97, 0.4) / 2, 1e-6);
  });

  it('дистанция кадрирования растёт вместе с габаритами', () => {
    const near = framingDistance(scene.bounds, 45, 16 / 9);
    const far = framingDistance(sceneBounds([{ ...scene.boxes[0], size: [10, 10, 10], position: [5, 5, 5] }]), 45, 16 / 9);
    expect(near).toBeGreaterThan(0.5);
    expect(far).toBeGreaterThan(near);
  });
});

describe('planogramScene — крючки и пустая планограмма', () => {
  it('mount=hook рисует крючковые штанги вместо настилов', () => {
    const hook: Planogram = {
      ...soap,
      shelf_units: [{ ...soap.shelf_units[0], id: 'hook-1', mount: 'hook', shelf_count: 3 }],
      sku_facings: [],
    };
    const scene = planogramScene(hook);
    expect(scene.boxes.filter((b) => b.kind === 'deck')).toHaveLength(0);
    expect(scene.boxes.filter((b) => b.kind === 'hook_rail')).toHaveLength(3);
    const rail = scene.boxes.find((b) => b.kind === 'hook_rail')!;
    approx(rail.size[1], HOOK_RAIL_MM * MM_TO_SCENE);
    expect(rail.shelf_no).toBe(1);
  });

  it('пустая планограмма (0 фейсингов) даёт стойки и полки без SKU', () => {
    const scene = planogramScene(empty);
    expect(scene.boxes.filter((b) => b.kind === 'facing')).toHaveLength(0);
    expect(scene.legend).toEqual([]);
    expect(scene.facings).toBe(0);
    expect(scene.boxes.length).toBe(2 + empty.shelf_units[0].shelf_count);
  });

  it('sceneBounds на пустом списке не даёт NaN/Infinity', () => {
    const bounds = sceneBounds([]);
    for (const value of [...bounds.min, ...bounds.max, ...bounds.center, bounds.radius]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(bounds.radius).toBeGreaterThan(0);
  });
});
