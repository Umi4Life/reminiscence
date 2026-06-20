<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <a href="/" class="back-link">← Dashboard</a>
        <h1 class="page-title">Venues</h1>
      </div>
      <a href="/venues/new" class="btn-primary">New venue</a>
    </div>
  </header>

  <main class="content">
    {#if data.venues.length === 0}
      <div class="empty-state">
        <p class="empty-title">No venues yet</p>
        <p class="empty-desc">Create your first venue to get started.</p>
        <a href="/venues/new" class="btn-primary">New venue</a>
      </div>
    {:else}
      <div class="venue-list">
        {#each data.venues as venue (venue.id)}
          <a href="/venues/{venue.id}" class="venue-row">
            <div class="venue-info">
              <span class="venue-name">{venue.name}</span>
              <span class="venue-meta">{venue.slug} · {venue.timezone}</span>
            </div>
            <span class="arrow">›</span>
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
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 1rem;
  }

  .header-inner {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    align-items: flex-end;
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

  .page-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .content {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }

  .empty-state {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 2rem 1.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .empty-desc {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    max-width: 360px;
    margin: 0;
    line-height: 1.6;
  }

  .venue-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .venue-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1rem 1.25rem;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.1s;
  }

  .venue-row:hover {
    border-color: var(--color-primary);
    text-decoration: none;
  }

  .venue-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .venue-name {
    font-weight: 600;
    color: var(--color-text);
    font-size: 0.9375rem;
  }

  .venue-meta {
    font-size: 0.75rem;
    color: var(--color-text-faint);
  }

  .arrow {
    color: var(--color-text-faint);
    font-size: 1.125rem;
    flex-shrink: 0;
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
    text-decoration: none;
  }
</style>
