<script lang="ts">
  import "@queue-reminiscence/ui/styles.css";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";

  let { children } = $props();
</script>

{@render children()}

<div class="theme-toggle-dock">
  <ThemeToggle />
</div>

<style>
  .theme-toggle-dock {
    position: fixed;
    bottom: 0.875rem;
    right: 0.875rem;
    z-index: 100;
  }
</style>
