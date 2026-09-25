<script lang="ts">
  /**
   * Phase 2.2 — one SkuFacing drawn as a rectangle (footprint width_mm × facings
   * packs, pack height_mm) with the product picture.
   *
   * Runtime guard: when `image_url` is empty/blank, or the image fails to load,
   * the rectangle falls back to a placeholder showing the SKU code — a broken
   * picture never removes the pack from the shelf.
   */
  import type { ShelfUnit, SkuFacing } from '$lib/planogram/types';
  import { mmToScene, shelfHeights, facingSpanMm, facingEndMm } from '$lib/planogram/geometry';

  let {
    facing,
    unit,
    pxPerMm,
    x0,
    floorY,
    invalid = false,
    warning = null,
    onpointerdown,
  }: {
    facing: SkuFacing;
    unit: ShelfUnit;
    pxPerMm: number;
    x0: number;
    floorY: number;
    invalid?: boolean;
    warning?: string | null;
    onpointerdown?: (facing: SkuFacing, event: PointerEvent) => void;
  } = $props();

  let imageFailed = $state(false);

  let imageUrl = $derived((facing.image_url ?? '').trim());
  let hasImage = $derived(imageUrl.length > 0);
  let showPlaceholder = $derived(!hasImage || imageFailed);

  let levels = $derived(shelfHeights(unit));
  let levelMm = $derived(levels[Math.min(Math.max(facing.shelf_no, 1), levels.length) - 1] ?? 0);
  let span = $derived(facingSpanMm(facing));
  let rectW = $derived(mmToScene(span, pxPerMm));
  let rectH = $derived(mmToScene(facing.height_mm, pxPerMm));
  let rectX = $derived(x0 + mmToScene(facing.x_mm, pxPerMm));
  let rectY = $derived(floorY - mmToScene(levelMm, pxPerMm) - rectH);
  let packW = $derived(mmToScene(facing.width_mm, pxPerMm));
  let labelSize = $derived(Math.max(8, Math.min(14, rectH / 3)));
  let tooltipY = $derived(rectY - 26);
</script>

<g
  class="sku-facing"
  class:invalid
  data-testid="sku-facing"
  data-sku={facing.sku}
  data-shelf-no={facing.shelf_no}
  data-x-mm={facing.x_mm}
  data-end-mm={facingEndMm(facing)}
  data-invalid={invalid ? 'true' : 'false'}
>
  <rect
    class="pack"
    data-testid="facing-rect"
    x={rectX}
    y={rectY}
    width={rectW}
    height={rectH}
    onpointerdown={(event) => onpointerdown?.(facing, event)}
  />
  {#if !showPlaceholder}
    <image
      class="overlay"
      data-testid="facing-image"
      href={imageUrl}
      x={rectX + 1}
      y={rectY + 1}
      width={Math.max(0, rectW - 2)}
      height={Math.max(0, rectH - 2)}
      preserveAspectRatio="xMidYMid meet"
      onerror={() => (imageFailed = true)}
    />
  {/if}
  {#if showPlaceholder}
    <g data-testid="facing-placeholder" class="placeholder overlay">
      <rect
        x={rectX + 1}
        y={rectY + 1}
        width={Math.max(0, rectW - 2)}
        height={Math.max(0, rectH - 2)}
        fill="#f1f5f9"
      />
      <text x={rectX + rectW / 2} y={rectY + rectH / 2} text-anchor="middle" dominant-baseline="middle" font-size={labelSize}>
        {facing.sku}
      </text>
    </g>
  {/if}

  <!-- Pack separators: one rectangle per facing, so counts are visible. -->
  {#each Array.from({ length: Math.max(0, facing.facings - 1) }, (_, i) => i) as i (i)}
    <line
      class="separator"
      x1={rectX + packW * (i + 1)}
      y1={rectY}
      x2={rectX + packW * (i + 1)}
      y2={rectY + rectH}
    />
  {/each}

  {#if warning}
    <g data-testid="bounds-tooltip" class="tooltip overlay">
      <rect x={rectX} y={tooltipY - 18} width={Math.max(220, warning.length * 6.5)} height="24" rx="4" />
      <text x={rectX + 8} y={tooltipY - 2} font-size="12">{warning}</text>
    </g>
  {/if}
</g>

<style>
  /* Only the pack rectangle may take pointer input: the picture, the SKU
     placeholder and the tooltip are overlays and must not block dragging. */
  .overlay,
  .separator {
    pointer-events: none;
  }
  .pack {
    fill: rgba(59, 130, 246, 0.12);
    stroke: #2563eb;
    stroke-width: 2;
    cursor: grab;
  }
  .separator {
    stroke: #2563eb;
    stroke-width: 1;
    stroke-dasharray: 4 3;
    pointer-events: none;
  }
  .placeholder text {
    fill: #334155;
    font-weight: 600;
  }
  .invalid .pack {
    stroke: #dc2626;
    stroke-width: 4;
    fill: rgba(220, 38, 38, 0.14);
  }
  .tooltip rect {
    fill: #dc2626;
  }
  .tooltip text {
    fill: #ffffff;
  }
</style>
