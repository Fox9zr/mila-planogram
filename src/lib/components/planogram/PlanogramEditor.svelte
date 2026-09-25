<script lang="ts">
  /**
   * Phase 2 — Mila planogram editor (retail domain, millimetres).
   *
   * Rendering: side projection of every shelf unit (ShelfUnit2D) with the SKU
   * facings of each shelf drawn on top (SkuFacing2D).
   * Editing: facings can be dragged along their shelf. Positions snap
   * edge-to-edge in millimetres by default; the «акция 10 см» toggle switches to
   * a 100 mm grid (per the Mila business process).
   *
   * Bounds are never violated silently: `clampFacingToShelf()` pulls the pack
   * back to the shelf and the rejected facing gets a red frame plus a tooltip.
   * Loaded/typed positions are checked with `validatePlanogramBounds()`.
   *
   * Deliberate deviation from upstream: this editor is its own SVG component
   * (like ElevationView) instead of an extension of FurnitureItem / the plan
   * canvas — the retail domain is mm-only and shares no state with the
   * residential one.
   */
  import type { Planogram, SkuFacing } from '$lib/planogram/types';
  import {
    mmToScene,
    sceneToMm,
    facingSpanMm,
    facingsOnShelf,
    clampFacingToShelf,
    snapFacingX,
    overshootWarning,
    PROMO_GRID_MM,
  } from '$lib/planogram/geometry';
  import { validatePlanogramBounds } from '$lib/planogram/validateBounds';
  import {
    parsePlanogram,
    serializePlanogram,
    semanticEqual,
    fromEditorModel,
    PlanogramParseError,
  } from '$lib/planogram/serialize';
  import ShelfUnit2D from './ShelfUnit2D.svelte';
  import SkuFacing2D from './SkuFacing2D.svelte';

  let {
    planogram: initialPlanogram,
    fixtureName = 'planogram',
  }: { planogram: Planogram; fixtureName?: string } = $props();

  /**
   * The edited document. It must be `$state` (deep proxy) — mutating a plain
   * prop object would update nothing on screen. The route hands over a private
   * clone of the fixture, so the fixture module is never touched.
   */
  let planogram = $state<Planogram>(initialPlanogram);

  const PX_PER_MM = 0.32;
  const MARGIN_MM = 150;
  const GAP_MM = 300;

  let svg = $state<SVGSVGElement | null>(null);
  let selectedKey = $state<string | null>(null);
  let dragKey = $state<string | null>(null);
  let warnings = $state<Record<string, string>>({});
  let lastSnap = $state<string>('');

  function facingKey(facing: SkuFacing): string {
    return `${facing.shelf_unit_id}#${facing.shelf_no}#${facing.sku}`;
  }

  /** Units laid out left to right, mm -> px. */
  let layout = $derived.by(() => {
    const out: { id: string; x0: number }[] = [];
    let cursor = MARGIN_MM;
    for (const unit of planogram.shelf_units) {
      out.push({ id: unit.id, x0: mmToScene(cursor, PX_PER_MM) });
      cursor += unit.width_mm + GAP_MM;
    }
    const totalMm = Math.max(cursor - GAP_MM + MARGIN_MM, 1200);
    const maxHeightMm = planogram.shelf_units.reduce((m, u) => Math.max(m, u.height_mm), 1000);
    return {
      units: out,
      viewBoxW: mmToScene(totalMm, PX_PER_MM),
      viewBoxH: mmToScene(maxHeightMm + MARGIN_MM * 2, PX_PER_MM),
      floorY: mmToScene(maxHeightMm + MARGIN_MM, PX_PER_MM),
    };
  });

  let unitById = $derived(new Map(planogram.shelf_units.map((u) => [u.id, u])));

  let violations = $derived(validatePlanogramBounds(planogram));
  let violationKeys = $derived(
    new Set(violations.map((v) => `${v.shelf_unit_id}${'|'}${v.sku}`)),
  );
  let violationDetail = $derived(new Map(violations.map((v) => [`${v.shelf_unit_id}|${v.sku}`, v.detail])));

  function warningFor(facing: SkuFacing): string | null {
    return warnings[facingKey(facing)] ?? violationDetail.get(`${facing.shelf_unit_id}|${facing.sku}`) ?? null;
  }

  function isInvalid(facing: SkuFacing): boolean {
    return violationKeys.has(`${facing.shelf_unit_id}|${facing.sku}`) || Boolean(warnings[facingKey(facing)]);
  }

  function facingAt(key: string): SkuFacing | undefined {
    return planogram.sku_facings.find((f) => facingKey(f) === key);
  }

  // ── Drag: millimetre snapping along the shelf ───────────────────────────
  let drag: { key: string; startClientX: number; startXMm: number; span: number; shelfUnitId: string; shelfNo: number } | null =
    null;

  function pxPerClientPx(): number {
    if (!svg) return 1;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return 1;
    return layout.viewBoxW / rect.width;
  }

  function beginDrag(facing: SkuFacing, event: PointerEvent) {
    const unit = unitById.get(facing.shelf_unit_id);
    if (!unit) return;
    event.preventDefault();
    selectFacing(facing);
    drag = {
      key: facingKey(facing),
      startClientX: event.clientX,
      startXMm: facing.x_mm,
      span: facingSpanMm(facing),
      shelfUnitId: facing.shelf_unit_id,
      shelfNo: facing.shelf_no,
    };
    dragKey = drag.key;
    svg?.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag) return;
    const facing = facingAt(drag.key);
    const unit = unitById.get(drag.shelfUnitId);
    if (!facing || !unit) return;

    const factor = pxPerClientPx();
    const deltaMm = sceneToMm((event.clientX - drag.startClientX) * factor, PX_PER_MM);
    const neighbours = facingsOnShelf(planogram.sku_facings, drag.shelfUnitId, drag.shelfNo).filter(
      (f) => facingKey(f) !== drag!.key,
    );
    const promoMode = Boolean(planogram.promo_mode);
    const requestedMm = drag.startXMm + deltaMm;
    const snapped = snapFacingX({
      rawX: requestedMm,
      span: drag.span,
      unit,
      neighbours,
      promoMode,
    });
    const clamped = clampFacingToShelf({ ...facing, x_mm: snapped.x_mm }, unit);

    facing.x_mm = clamped.facing.x_mm;
    // Snapping already pulls the facing back to the edge, so the overshoot is
    // reported from the *requested* position — the clamp must never be silent.
    const warning = clamped.warning ?? overshootWarning(unit, drag.span, requestedMm);
    if (warning) warnings = { ...warnings, [drag.key]: warning };
    else {
      const next = { ...warnings };
      delete next[drag.key];
      warnings = next;
    }
    lastSnap = snapped.kind
      ? `${snapped.kind === 'grid' ? 'сетка 100 мм' : snapped.kind === 'neighbour' ? 'стык к соседу' : snapped.kind === 'left_edge' ? 'левый край полки' : 'правый край полки'} → ${snapped.x_mm} мм`
      : `без прилипания → ${snapped.x_mm} мм`;
  }

  function endDrag(event?: PointerEvent) {
    if (!drag) return;
    if (event) svg?.releasePointerCapture?.(event.pointerId);
    drag = null;
    dragKey = null;
  }

  // ── Serialization (2.4): editor ⇄ Planogram JSON ────────────────────────
  let savedJson = $state<string | null>(null);
  let loadError = $state<string | null>(null);
  let jsonText = $state('');
  let lastSavedAt = $state<string | null>(null);

  /** Editor model → JSON in canonical schema key order. */
  let serialized = $derived(
    serializePlanogram(fromEditorModel({ planogram, promoMode: Boolean(planogram.promo_mode) })),
  );

  /** Round-trip criterion: semantic deepEqual after normalize + reserialize. */
  let roundTripOk = $derived.by(() => {
    try {
      return semanticEqual(parsePlanogram(serialized), fromEditorModel({ planogram, promoMode: Boolean(planogram.promo_mode) }));
    } catch {
      return false;
    }
  });

  function saveJson() {
    loadError = null;
    savedJson = serialized;
    jsonText = serialized;
    lastSavedAt = new Date().toISOString();
  }

  /** JSON → editor: the parsed document replaces the edited one in place. */
  function loadJson(text: string) {
    try {
      const next = parsePlanogram(text);
      planogram.name = next.name;
      planogram.category = next.category;
      planogram.store_format = next.store_format;
      if (next.created_at === undefined) delete planogram.created_at;
      else planogram.created_at = next.created_at;
      planogram.promo_mode = Boolean(next.promo_mode);
      planogram.shelf_units = next.shelf_units;
      planogram.sku_facings = next.sku_facings;
      selectedKey = null;
      warnings = {};
      loadError = null;
      return true;
    } catch (error) {
      loadError = error instanceof PlanogramParseError ? error.issues.join('; ') : String(error);
      return false;
    }
  }

  function selectFacing(facing: SkuFacing) {
    selectedKey = facingKey(facing);
  }

  let selected = $derived(selectedKey ? facingAt(selectedKey) ?? null : null);

  function setSelectedX(value: string) {
    const facing = selected;
    if (!facing) return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    facing.x_mm = parsed; // deliberately unclamped: bounds show up as a red frame
  }
</script>

<div class="planogram-editor" data-testid="planogram-editor" data-fixture={fixtureName}>
  <header class="bar">
    <label class="promo">
      <input
        type="checkbox"
        data-testid="promo-toggle"
        checked={Boolean(planogram.promo_mode)}
        onchange={(event) => (planogram.promo_mode = event.currentTarget.checked)}
      />
      Акция 10 см (сетка {PROMO_GRID_MM} мм)
    </label>
    <span class="snap-mode" data-testid="snap-mode">
      {planogram.promo_mode ? 'прилипание: сетка 100 мм' : 'прилипание: мм, стык-в-стык'}
    </span>
    <span class="snap-last" data-testid="snap-last">{lastSnap}</span>
    <span class="violations" data-testid="violation-count" data-count={violations.length}>
      нарушений границ: {violations.length}
    </span>
    <button type="button" data-testid="save-json" onclick={saveJson}>Сохранить JSON</button>
    <span
      class="roundtrip"
      data-testid="roundtrip-status"
      data-ok={roundTripOk ? 'true' : 'false'}
      data-saved-at={lastSavedAt ?? ''}
    >round-trip (семантический deepEqual): {roundTripOk ? 'OK' : 'ОШИБКА'}</span>
  </header>

  <svg
    bind:this={svg}
    class="planogram-canvas"
    data-testid="planogram-canvas"
    role="img"
    aria-label="Планограмма: боковая проекция стеллажа"
    viewBox="0 0 {layout.viewBoxW} {layout.viewBoxH}"
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  >
    {#each planogram.shelf_units as unit (unit.id)}
      {@const origin = layout.units.find((u) => u.id === unit.id)?.x0 ?? 0}
      <ShelfUnit2D {unit} pxPerMm={PX_PER_MM} x0={origin} floorY={layout.floorY} />
      {#each { length: unit.shelf_count } as _, index (index)}
        {#each facingsOnShelf(planogram.sku_facings, unit.id, index + 1) as facing (facingKey(facing))}
          <SkuFacing2D
            {facing}
            {unit}
            pxPerMm={PX_PER_MM}
            x0={origin}
            floorY={layout.floorY}
            invalid={isInvalid(facing)}
            warning={warningFor(facing)}
            onpointerdown={beginDrag}
          />
        {/each}
      {/each}
    {/each}
  </svg>

  <section class="json" data-testid="json-panel">
    <label for="planogram-json-input">Planogram JSON (schema v1, мм)</label>
    <textarea
      id="planogram-json-input"
      data-testid="planogram-json-input"
      rows="8"
      bind:value={jsonText}
      placeholder="Вставьте планограмму JSON и нажмите «Загрузить JSON»"
    ></textarea>
    <div class="json-actions">
      <button type="button" data-testid="load-json" onclick={() => loadJson(jsonText)}>Загрузить JSON</button>
    </div>
    {#if loadError}
      <p class="error" data-testid="json-error">{loadError}</p>
    {/if}
    {#if savedJson}
      <pre data-testid="planogram-json">{savedJson}</pre>
    {/if}
  </section>

  <aside class="inspector" data-testid="facing-inspector">
    {#if selected}
      <h2 data-testid="selected-sku">{selected.sku}</h2>
      <p class="name">{selected.name ?? '—'}</p>
      <label>
        x, мм (от левого края полки)
        <input
          type="number"
          data-testid="facing-x-input"
          value={selected.x_mm}
          min="0"
          onchange={(event) => setSelectedX(event.currentTarget.value)}
        />
      </label>
      <dl>
        <dt>полка</dt><dd>{selected.shelf_no}</dd>
        <dt>ширина упаковки</dt><dd>{selected.width_mm} мм</dd>
        <dt>высота упаковки</dt><dd>{selected.height_mm} мм</dd>
        <dt>фейсингов</dt><dd>{selected.facings}</dd>
        <dt>габарит по полке</dt><dd>{facingSpanMm(selected)} мм</dd>
      </dl>
    {:else}
      <p data-testid="facing-inspector-empty">Выберите фейсинг на полке</p>
    {/if}
  </aside>
</div>

<style>
  .planogram-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 12px;
    padding: 12px;
    background: #f8fafc;
    color: #0f172a;
  }
  .bar {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    font-size: 13px;
  }
  .planogram-canvas {
    width: 100%;
    height: 70vh;
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    touch-action: none;
  }
  .inspector {
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 12px;
    font-size: 13px;
  }
  .inspector h2 {
    margin: 0 0 4px;
    font-size: 15px;
  }
  .inspector dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 2px 10px;
    margin: 8px 0 0;
  }
  .inspector dt {
    color: #475569;
  }
  .inspector input {
    width: 100%;
    margin-top: 4px;
  }
  .json {
    grid-column: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .json textarea {
    width: 100%;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .json pre {
    max-height: 220px;
    overflow: auto;
    background: #0f172a;
    color: #e2e8f0;
    padding: 10px;
    border-radius: 6px;
    font-size: 12px;
  }
  .json .error {
    color: #b91c1c;
    font-weight: 600;
  }
  .roundtrip[data-ok='false'] {
    color: #b91c1c;
    font-weight: 600;
  }
  .violations[data-count]:not([data-count='0']) {
    color: #b91c1c;
    font-weight: 600;
  }
</style>
