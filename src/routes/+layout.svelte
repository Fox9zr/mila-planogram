<script>
  import '../app.css';
  import { initializeLocale } from '$lib/i18n';
  onMount(initializeLocale);
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { themePreference } from '$lib/stores/theme';
  import DeploymentNotice from '$lib/components/DeploymentNotice.svelte';
  // Phase 1.2: the Firebase analytics bootstrap was removed with the rest of the
  // Firebase footprint. The app has no remote runtime dependency.
  let { children } = $props();
</script>

{@render children()}
<DeploymentNotice />
