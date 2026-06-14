<script lang="ts">
  import { goto } from "$app/navigation";
  import { logout, getPublicBoard, type BoardSummary } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let boards = $derived(data.boards);
  let queueCounts = $state<Record<string, number | null>>({});
  let logoutBusy = $state(false);

  $effect(() => {
    const currentBoards = boards;
    for (const board of currentBoards) {
      if (!(board.id in queueCounts)) {
        queueCounts[board.id] = null;
        getPublicBoard(board.publicSlug).then((result) => {
          if (result) {
            queueCounts[board.id] = result.board.queue.length;
          }
        });
      }
    }
  });

  async function doLogout() {
    logoutBusy = true;
    try {
      await logout();
    } catch {
      // ignore — redirect anyway
    }
    await goto("/login");
  }
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <p class="header-label">Admin</p>
        <h1 class="header-name">{data.session?.admin.displayName ?? ""}</h1>
      </div>
      <button class="logout-btn" onclick={doLogout} disabled={logoutBusy}>
        {logoutBusy ? "Logging out…" : "Log out"}
      </button>
    </div>
  </header>

  <main class="content">
    <h2 class="section-title">Boards</h2>

    {#if boards.length === 0}
      <div class="empty-state">
        <p class="empty-title">No boards yet</p>
        <p class="empty-desc">You don't have access to any boards. Contact your organisation owner to be added.</p>
      </div>
    {:else}
      <div class="board-list">
        {#each boards as board (board.id)}
          {@const count = queueCounts[board.id]}
          <a href="/boards/{board.id}" class="board-row">
            <div class="board-info">
              <span class="board-name">{board.name}</span>
              <span class="board-slug">{board.publicSlug}</span>
            </div>
            <div class="board-meta">
              <span class="status-badge status-{board.status}">
                {board.status === "open" ? "Open" : "Closed"}
              </span>
              <span class="queue-count">
                Queue: {count === undefined || count === null ? "—" : count}
              </span>
              <span class="arrow">›</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </main>
</div>

<style>
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
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .header-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    margin-bottom: 0.125rem;
  }

  .header-name {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }

  .logout-btn {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    color: #374151;
    cursor: pointer;
    font-weight: 500;
    white-space: nowrap;
  }

  .logout-btn:hover:not(:disabled) {
    background: #f9fafb;
  }

  .logout-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .content {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #374151;
    margin-bottom: 1rem;
  }

  .empty-state {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 2rem 1.5rem;
    text-align: center;
  }

  .empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
  }

  .empty-desc {
    font-size: 0.9375rem;
    color: #6b7280;
    max-width: 360px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .board-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .board-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.1s;
  }

  .board-row:hover {
    border-color: #2563eb;
    text-decoration: none;
  }

  .board-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .board-name {
    font-weight: 600;
    color: #111827;
    font-size: 0.9375rem;
  }

  .board-slug {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .board-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .status-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-open {
    background: #d1fae5;
    color: #065f46;
  }

  .status-closed {
    background: #fee2e2;
    color: #991b1b;
  }

  .queue-count {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .arrow {
    color: #9ca3af;
    font-size: 1.125rem;
  }
</style>
