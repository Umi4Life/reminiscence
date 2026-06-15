<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<div class="container">
  {#if data.result.reason === "expired" || data.result.reason === "revoked"}
    <div class="card">
      <h1 class="title">Link no longer active</h1>
      <p class="message">This queue link is no longer active for editing.</p>
      <p class="message">
        You can still view the board, but adding or removing names requires scanning the current
        on-site QR code.
      </p>
      {#if data.result.board}
        <a href="/b/{data.result.board.publicSlug}" class="button">View board</a>
      {/if}
    </div>
  {:else}
    <div class="card">
      <h1 class="title">Invalid link</h1>
      <p class="message">{data.result.message}</p>
    </div>
  {/if}
</div>

<style>
  .container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
  }

  /* .card (box) comes from @queue-reminiscence/ui/components.css */
  .card {
    max-width: 480px;
    width: 100%;
    text-align: center;
  }

  .title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 1rem;
  }

  .message {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    margin-bottom: 0.75rem;
    line-height: 1.6;
  }

  .button {
    display: inline-block;
    margin-top: 1.25rem;
    padding: 0.625rem 1.5rem;
    background: var(--color-primary);
    color: #fff;
    border-radius: var(--radius-md);
    font-size: 0.9375rem;
    font-weight: 500;
    text-decoration: none;
  }

  .button:hover {
    background: var(--color-primary-hover);
    text-decoration: none;
  }
</style>
