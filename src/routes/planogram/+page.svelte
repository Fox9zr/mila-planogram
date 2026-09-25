<script lang="ts">
  /**
   * Phase 2 — planogram editor route: /planogram?fixture=soap|empty
   *
   * The Mila fixtures from Phase 0 are the contract; opening one here is the
   * cheapest end-to-end proof that the retail domain renders and edits.
   */
  import { page } from '$app/state';
  import PlanogramEditor from '$lib/components/planogram/PlanogramEditor.svelte';
  import type { Planogram } from '$lib/planogram/types';
  import soapFixture from '../../../fixtures/planogram-soap.json';
  import emptyFixture from '../../../fixtures/planogram-empty.json';

  let fixtureName = $derived(page.url.searchParams.get('fixture') === 'empty' ? 'empty' : 'soap');

  /** Fixtures are module-level objects: hand the editor a private copy. */
  function clone(source: unknown): Planogram {
    return JSON.parse(JSON.stringify(source)) as Planogram;
  }
</script>

<svelte:head>
  <title>Планограмма Mila</title>
</svelte:head>

<main data-testid="planogram-page">
  <nav class="fixtures">
    <a href="/planogram?fixture=soap" data-testid="fixture-soap" class:active={fixtureName === 'soap'}>
      Мыло (fixture soap)
    </a>
    <a href="/planogram?fixture=empty" data-testid="fixture-empty" class:active={fixtureName === 'empty'}>
      Пустая планограмма
    </a>
  </nav>
  {#key fixtureName}
    <PlanogramEditor
      planogram={clone(fixtureName === 'empty' ? emptyFixture : soapFixture)}
      {fixtureName}
    />
  {/key}
</main>

<style>
  main {
    min-height: 100vh;
    background: #f8fafc;
  }
  .fixtures {
    display: flex;
    gap: 12px;
    padding: 12px 12px 0;
    font-size: 14px;
  }
  .fixtures a {
    color: #2563eb;
    text-decoration: none;
  }
  .fixtures a.active {
    font-weight: 700;
    text-decoration: underline;
  }
</style>
