<script lang="ts">
  /**
   * Phase 3.2 — 3D-превью стеллажа (Three.js).
   *
   * Компонент намеренно тонкий: вся геометрия приходит из `planogramScene()`
   * (чистый модуль, покрыт unit-тестами), здесь только сборка мешей, свет,
   * орбитальная камера и кадрирование по габаритам сцены.
   *
   * Если WebGL недоступен, компонент не падает, а показывает заглушку:
   * планограмма остаётся работоспособной в 2D.
   */
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import type { Planogram } from '$lib/planogram/types';
  import { framingDistance, planogramScene } from '$lib/planogram/viewer3dGeometry';

  let {
    planogram,
    height = 420,
  }: { planogram: Planogram; height?: number } = $props();

  let host: HTMLDivElement | null = $state(null);
  let ready = $state(false);
  let failure = $state<string | null>(null);
  let boxCount = $state(0);
  let racks = $state(0);
  let facingCount = $state(0);
  let legend = $state<{ sku: string; color: number; name?: string }[]>([]);

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let frameHandle = 0;
  const content = new THREE.Group();

  function cssColor(value: number): string {
    return `#${value.toString(16).padStart(6, '0')}`;
  }

  /** Снимок планограммы: сборка мешей не должна читать реактивный прокси на ходу. */
  function snapshot(source: Planogram): Planogram {
    return JSON.parse(JSON.stringify(source)) as Planogram;
  }

  function initRenderer(container: HTMLDivElement): boolean {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch (error) {
      failure = `WebGL недоступен: ${error instanceof Error ? error.message : String(error)}`;
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || height, false);
    renderer.domElement.setAttribute('data-testid', 'planogram-3d-canvas');
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.add(content);

    camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 200);
    camera.position.set(1.6, 1.6, 2.4);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 0.4;
    controls.maxDistance = 40;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x475569, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-2, 2, -2.5);
    scene.add(fill);

    const grid = new THREE.GridHelper(12, 24, 0xcbd5e1, 0xe2e8f0);
    grid.name = 'grid';
    scene.add(grid);

    return true;
  }

  function disposeContent(): void {
    for (const child of [...content.children]) {
      content.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    }
  }

  function frameCamera(center: [number, number, number], radius: number, fov: number, aspect: number): void {
    if (!camera || !controls) return;
    const distance = framingDistance({ min: [0, 0, 0], max: [0, 0, 0], center, radius }, fov, aspect);
    const direction = new THREE.Vector3(0.55, 0.45, 1).normalize();
    camera.position.copy(new THREE.Vector3(...center).add(direction.multiplyScalar(distance)));
    camera.near = Math.max(0.02, distance / 100);
    camera.far = distance * 12;
    camera.updateProjectionMatrix();
    controls.target.set(...center);
    controls.update();
  }

  function rebuild(source: Planogram): void {
    if (!scene) return;
    const built = planogramScene(source);
    disposeContent();
    for (const box of built.boxes) {
      const geometry = new THREE.BoxGeometry(box.size[0], box.size[1], box.size[2]);
      const material = new THREE.MeshStandardMaterial({
        color: box.color,
        roughness: box.kind === 'facing' ? 0.5 : 0.9,
        metalness: 0.04,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(box.position[0], box.position[1], box.position[2]);
      mesh.name = box.id;
      mesh.userData = { kind: box.kind, sku: box.sku, shelf_no: box.shelf_no };
      content.add(mesh);
    }
    boxCount = built.boxes.length;
    racks = built.racks;
    facingCount = built.facings;
    legend = built.legend;
    const aspect = (renderer?.domElement.clientWidth || 640) / (renderer?.domElement.clientHeight || height);
    frameCamera(built.bounds.center, built.bounds.radius, camera?.fov ?? 45, aspect);
  }

  function resize(): void {
    if (!renderer || !camera || !host) return;
    const width = host.clientWidth || 640;
    const h = host.clientHeight || height;
    renderer.setSize(width, h, false);
    camera.aspect = width / h;
    camera.updateProjectionMatrix();
  }

  function resetView(): void {
    const built = planogramScene(snapshot(planogram));
    const aspect = (renderer?.domElement.clientWidth || 640) / (renderer?.domElement.clientHeight || height);
    frameCamera(built.bounds.center, built.bounds.radius, camera?.fov ?? 45, aspect);
  }

  /** Снимок текущего вида — тем же canvas, что видит пользователь. */
  function snapshotPng(): string | null {
    if (!renderer) return null;
    try {
      return renderer.domElement.toDataURL('image/png');
    } catch (error) {
      failure = `Не удалось снять PNG: ${error instanceof Error ? error.message : String(error)}`;
      return null;
    }
  }

  export function exportPng(filename = 'planogram-3d.png'): boolean {
    const url = snapshotPng();
    if (!url) return false;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    return true;
  }

  // Инициализация + пересборка при изменении планограммы (глубокое чтение через снимок).
  $effect(() => {
    const source = snapshot(planogram);
    if (!host) return;
    if (!renderer && !failure) {
      if (!initRenderer(host)) return;
      frameHandle = requestAnimationFrame(function tick() {
        if (!renderer || !scene || !camera || !controls) return;
        controls.update();
        renderer.render(scene, camera);
        ready = true; // первый отрендеренный кадр — сигнал для E2E
        frameHandle = requestAnimationFrame(tick);
      });
      window.addEventListener('resize', resize);
    }
    if (renderer) rebuild(source);
  });

  // Уборка ресурсов — только при уничтожении компонента.
  $effect(() => {
    return () => {
      if (frameHandle) cancelAnimationFrame(frameHandle);
      if (typeof window !== 'undefined') window.removeEventListener('resize', resize);
      disposeContent();
      controls?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = null;
      scene = null;
      camera = null;
      controls = null;
    };
  });
</script>

<section class="viewer-3d" data-testid="planogram-3d">
  <header class="bar">
    <strong>3D-превью стеллажа</strong>
    <span data-testid="planogram-3d-status">
      {#if failure}
        {failure}
      {:else if ready}
        объектов: {boxCount} · стеллажей: {racks} · фейсингов: {facingCount}
      {:else}
        инициализация…
      {/if}
    </span>
    <button type="button" data-testid="planogram-3d-reset" onclick={resetView} disabled={!ready}>Сбросить вид</button>
    <button type="button" data-testid="planogram-3d-png" onclick={() => exportPng()} disabled={!ready}>Снимок PNG</button>
  </header>

  <div class="stage" bind:this={host} style={`height:${height}px`} data-ready={ready ? 'true' : 'false'} data-box-count={boxCount} data-racks={racks} data-facings={facingCount}>
    {#if failure}
      <p class="fallback" data-testid="planogram-3d-fallback">{failure}</p>
    {/if}
  </div>

  {#if legend.length > 0}
    <ul class="legend" data-testid="planogram-3d-legend">
      {#each legend as entry (entry.sku)}
        <li data-testid="planogram-3d-legend-item" data-sku={entry.sku}>
          <span class="swatch" style={`background:${cssColor(entry.color)}`}></span>
          {entry.sku}{entry.name ? ` — ${entry.name}` : ''}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .viewer-3d {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 10px;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: #0f172a;
  }
  .stage {
    position: relative;
    width: 100%;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    touch-action: none;
    overflow: hidden;
  }
  .fallback {
    margin: 0;
    padding: 16px;
    color: #b91c1c;
    font-size: 13px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: #334155;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .swatch {
    width: 11px;
    height: 11px;
    border-radius: 2px;
    border: 1px solid #94a3b8;
  }
</style>
