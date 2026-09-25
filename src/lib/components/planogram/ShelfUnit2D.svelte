<script lang="ts">
  /**
   * Phase 2.1 — side projection (elevation) of one ShelfUnit, drawn in mm→px.
   *
   * This is a *pure* retail component: it does not inherit FurnitureItem and
   * shares no state with the residential editor. `mount: 'hook'` draws hook
   * rails instead of shelf decks.
   */
  import type { ShelfUnit } from '$lib/planogram/types';
  import { shelfHeights, mmToScene, POST_MM, DECK_MM } from '$lib/planogram/geometry';

  let {
    unit,
    pxPerMm,
    x0,
    floorY,
  }: { unit: ShelfUnit; pxPerMm: number; x0: number; floorY: number } = $props();

  let levels = $derived(shelfHeights(unit));
  let width = $derived(mmToScene(unit.width_mm, pxPerMm));
  let height = $derived(mmToScene(unit.height_mm, pxPerMm));
  let postW = $derived(Math.max(2, mmToScene(POST_MM, pxPerMm)));
  let deckH = $derived(Math.max(2, mmToScene(DECK_MM, pxPerMm)));
  let innerX = $derived(x0 + postW);
  let innerW = $derived(Math.max(0, width - postW * 2));
</script>

<g
  class="shelf-unit"
  data-testid="shelf-unit"
  data-unit-id={unit.id}
  data-mount={unit.mount}
  data-shelf-count={unit.shelf_count}
  data-width-mm={unit.width_mm}
  data-height-mm={unit.height_mm}
>
  <rect class="unit-box" x={x0} y={floorY - height} width={width} height={height} rx="2" />
  <rect class="post" x={x0} y={floorY - height} width={postW} height={height} />
  <rect class="post" x={x0 + width - postW} y={floorY - height} width={postW} height={height} />

  {#each levels as level, index (index)}
    {#if unit.mount === 'hook'}
      <line
        class="hook-rail"
        data-testid="shelf-hook-rail"
        data-shelf-no={index + 1}
        x1={innerX}
        y1={floorY - mmToScene(level, pxPerMm)}
        x2={innerX + innerW}
        y2={floorY - mmToScene(level, pxPerMm)}
      />
    {:else}
      <rect
        class="deck"
        data-testid="shelf-deck"
        data-shelf-no={index + 1}
        data-level-mm={level}
        x={innerX}
        y={floorY - mmToScene(level, pxPerMm)}
        width={innerW}
        height={deckH}
      />
    {/if}
  {/each}

  <line class="floor" x1={x0 - postW} y1={floorY} x2={x0 + width + postW} y2={floorY} />
  {#if unit.label}
    <text class="unit-label" data-testid="shelf-unit-label" x={x0} y={floorY + mmToScene(90, pxPerMm)}>
      {unit.label}
    </text>
  {/if}
  <text class="unit-dims" data-testid="shelf-unit-dims" x={x0} y={floorY - height - mmToScene(20, pxPerMm)}>
    {unit.width_mm}×{unit.depth_mm}×{unit.height_mm} мм · {unit.shelf_count} полок · {unit.mount === 'hook'
      ? 'крючки'
      : 'полки'}
  </text>
</g>

<style>
  .unit-box {
    fill: #ffffff;
    stroke: #94a3b8;
    stroke-width: 1;
  }
  .post {
    fill: #cbd5e1;
    stroke: #64748b;
    stroke-width: 1;
  }
  .deck {
    fill: #e2e8f0;
    stroke: #64748b;
    stroke-width: 1;
  }
  .hook-rail {
    stroke: #64748b;
    stroke-width: 3;
    stroke-dasharray: 10 6;
  }
  .floor {
    stroke: #334155;
    stroke-width: 3;
  }
  .unit-label {
    fill: #0f172a;
    font-size: 14px;
    font-weight: 600;
  }
  .unit-dims {
    fill: #475569;
    font-size: 12px;
  }
</style>
