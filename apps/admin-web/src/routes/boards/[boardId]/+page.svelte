<script lang="ts">
  import { untrack } from "svelte";
  import { getPublicBoardEvents, type BoardSummary, type PublicBoardEvent } from "$lib/api";
  import AdminBoardControls from "$lib/components/AdminBoardControls.svelte";
  import AdminBoardEditForm from "$lib/components/AdminBoardEditForm.svelte";
  import AdminEventHistory from "$lib/components/AdminEventHistory.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let board = $state<BoardSummary | null>(untrack(() => data.board));
  let events = $state<PublicBoardEvent[]>(untrack(() => data.events));

  function onBoardUpdated(updated: BoardSummary) {
    board = updated;
  }

  async function refreshEvents() {
    if (!board) return;
    try {
      const result = await getPublicBoardEvents(board.publicSlug, 20);
      events = result.events;
    } catch {
      // keep existing events
    }
  }
</script>

{#if !board}
  <div class="not-found-container">
    <div class="card">
      <h1 class="not-found-title">Board not found</h1>
      <p class="not-found-msg">This board doesn't exist or you don't have access to it.</p>
      <a href="/" class="back-link">← Back to dashboard</a>
    </div>
  </div>
{:else}
  <div class="page">
    <header class="header">
      <div class="header-inner">
        <div>
          <a href="/" class="back-link">← Dashboard</a>
          <h1 class="board-name">{board.name}</h1>
          <p class="board-slug">{board.publicSlug}</p>
        </div>
        <span class="status-badge status-{board.status}">
          {board.status === "open" ? "Open" : "Closed"}
        </span>
      </div>
    </header>

    <main class="content">
      <AdminBoardEditForm {board} venueName={data.venueName} {onBoardUpdated} />
      <AdminBoardControls {board} {onBoardUpdated} onRefreshEvents={refreshEvents} />
      <AdminEventHistory {events} />
    </main>
  </div>
{/if}

<style>
  /* .card (box) and .status-open / .status-closed colors come from
     @queue-reminiscence/ui/components.css. */
  .not-found-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
  }

  .card {
    max-width: 480px;
    width: 100%;
    text-align: center;
  }

  .not-found-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 0.75rem;
  }

  .not-found-msg {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    margin-bottom: 1.25rem;
  }

  .page {
    min-height: 100vh;
  }

  .header {
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 1rem;
  }

  .header-inner {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .back-link {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-decoration: none;
    display: block;
    margin-bottom: 0.375rem;
  }

  .back-link:hover {
    color: var(--color-text);
    text-decoration: underline;
  }

  .board-name {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .board-slug {
    font-size: 0.75rem;
    color: var(--color-text-faint);
    margin-top: 0.125rem;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-pill);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
    margin-top: 0.25rem;
  }

  .content {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>
