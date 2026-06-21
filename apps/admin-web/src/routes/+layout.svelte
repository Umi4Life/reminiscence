<script lang="ts">
  import "@queue-reminiscence/ui/styles.css";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";

  let { children } = $props();
</script>

<div class="app-shell">
  <div class="app-main">{@render children()}</div>
  <footer class="site-footer">
    <a href="https://github.com/Umi4Life/reminiscence" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
        <path
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
      Reminiscence on GitHub
    </a>
  </footer>
</div>

<div class="theme-toggle-dock">
  <ThemeToggle />
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app-main {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
  }

  /* Pages set their own `min-height: 100vh` to fill the screen. Inside this flex
     shell that would push the footer below the fold, so let the page grow to
     fill the available space instead and drop the hard 100vh floor.
     `!important` is needed to beat the page components' scoped class selectors. */
  .app-main > :global(*) {
    flex: 1 0 auto;
    min-height: 0 !important;
  }

  .site-footer {
    flex-shrink: 0;
    text-align: center;
    /* Extra right padding keeps the centered link clear of the fixed theme dock. */
    padding: 1.25rem 3.5rem 1.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .site-footer a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .site-footer a svg {
    width: 1.05em;
    height: 1.05em;
    flex-shrink: 0;
  }

  .site-footer a:hover {
    color: var(--color-text);
    text-decoration: underline;
  }

  .theme-toggle-dock {
    position: fixed;
    bottom: 0.875rem;
    right: 0.875rem;
    z-index: 100;
  }

  /* On narrow screens the centered footer link spans most of the width, so the
     fixed theme toggle overlaps it. Lift the link above the toggle instead of
     relying on side padding. */
  @media (max-width: 640px) {
    .site-footer {
      padding: 1.25rem 1.25rem 4rem;
    }
  }
</style>
