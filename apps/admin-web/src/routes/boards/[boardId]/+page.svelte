<script lang="ts">
  import { untrack } from "svelte";
  import { getPublicBoardEvents, type BoardSummary, type PublicBoardEvent } from "$lib/api";
  import AdminBoardControls from "$lib/components/AdminBoardControls.svelte";
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
      <AdminBoardControls {board} {onBoardUpdated} onRefreshEvents={refreshEvents} />
      <AdminEventHistory {events} />
    </main>
  </div>
{/if}

<style>
  .not-found-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
  }

  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 2rem 1.5rem;
    max-width: 480px;
    width: 100%;
    text-align: center;
  }

  .not-found-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.75rem;
  }

  .not-found-msg {
    color: #6b7280;
    font-size: 0.9375rem;
    margin-bottom: 1.25rem;
  }

  .page {
    min-height: 100vh;
  }

  .header {
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
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
    color: #6b7280;
    text-decoration: none;
    display: block;
    margin-bottom: 0.375rem;
  }

  .back-link:hover {
    color: #111827;
    text-decoration: underline;
  }

  .board-name {
    font-size: 1.25rem;
    font-weight: 700;
    color: #111827;
  }

  .board-slug {
    font-size: 0.75rem;
    color: #9ca3af;
    margin-top: 0.125rem;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
    margin-top: 0.25rem;
  }

  .status-open {
    background: #d1fae5;
    color: #065f46;
  }

  .status-closed {
    background: #fee2e2;
    color: #991b1b;
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
