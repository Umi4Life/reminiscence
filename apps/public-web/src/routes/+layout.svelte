<script lang="ts">
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    color: #111827;
    background: #f9fafb;
    min-height: 100vh;
  }

  :global(a) {
    color: #2563eb;
    text-decoration: none;
  }

  :global(a:hover) {
    text-decoration: underline;
  }
</style>
