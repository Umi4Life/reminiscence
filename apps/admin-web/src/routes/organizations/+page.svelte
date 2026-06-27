<script lang="ts">
  import { listOrganizations, type OrganizationSummary } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let organizations = $state<OrganizationSummary[]>(data.organizations);
  let nextCursor = $state<string | null>(data.nextCursor);
  let loadingMore = $state(false);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    try {
      const result = await listOrganizations(undefined, { cursor: nextCursor });
      organizations = [...organizations, ...result.organizations];
      nextCursor = result.nextCursor;
    } catch {
      // keep existing list
    } finally {
      loadingMore = false;
    }
  }
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <a href="/" class="back-link">← Dashboard</a>
        <h1 class="page-title">Organizations</h1>
      </div>
      <a href="/organizations/new" class="new-btn">New organization</a>
    </div>
  </header>

  <main class="content">
    {#if organizations.length === 0}
      <div class="empty-state">
        <p class="empty-title">No organizations yet</p>
        <p class="empty-desc">Create your first organization to get started.</p>
      </div>
    {:else}
      <div class="org-list">
        {#each organizations as org (org.id)}
          <a href="/organizations/{org.id}" class="org-row">
            <div class="org-info">
              <span class="org-name">{org.name}</span>
              <span class="org-slug">{org.slug}</span>
            </div>
            <span class="arrow">›</span>
          </a>
        {/each}
      </div>
      {#if nextCursor}
        <div class="load-more">
          <button onclick={loadMore} disabled={loadingMore} class="load-more-btn">
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      {/if}
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
    align-items: center;
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
    font-size: 1.375rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .new-btn {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }

  .new-btn:hover {
    background: var(--color-primary-hover);
    text-decoration: none;
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
  }

  .empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 0.5rem;
  }

  .empty-desc {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    max-width: 360px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .org-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .org-row {
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

  .org-row:hover {
    border-color: var(--color-primary);
    text-decoration: none;
  }

  .org-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .org-name {
    font-weight: 600;
    color: var(--color-text);
    font-size: 0.9375rem;
  }

  .org-slug {
    font-size: 0.75rem;
    color: var(--color-text-faint);
  }

  .arrow {
    color: var(--color-text-faint);
    font-size: 1.125rem;
    flex-shrink: 0;
  }

  .load-more {
    margin-top: 1rem;
    display: flex;
    justify-content: center;
  }

  .load-more-btn {
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0.5rem 1.25rem;
    font-size: 0.875rem;
    color: var(--color-text);
    cursor: pointer;
  }

  .load-more-btn:hover:not(:disabled) {
    background: var(--color-bg);
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
