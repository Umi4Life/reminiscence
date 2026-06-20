<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <a href="/" class="back-link">← Dashboard</a>
        <h1 class="page-title">Admins</h1>
      </div>
      {#if data.session?.admin.isSuperAdmin}
        <a href="/admins/new" class="btn-primary">New admin</a>
      {/if}
    </div>
  </header>

  <main class="content">
    {#if !data.session?.admin.isSuperAdmin}
      <div class="card">
        <p class="error">You do not have permission to manage admins.</p>
      </div>
    {:else if data.admins.length === 0}
      <div class="empty-state">
        <p class="empty-title">No admins yet</p>
        <p class="empty-desc">Create your first admin to get started.</p>
        <a href="/admins/new" class="btn-primary">New admin</a>
      </div>
    {:else}
      <div class="admin-list">
        {#each data.admins as admin (admin.id)}
          <a href="/admins/{admin.id}" class="admin-row">
            <div class="admin-info">
              <span class="admin-name">{admin.displayName}</span>
              <span class="admin-meta">{admin.email}{admin.isSuperAdmin ? " · super-admin" : ""}</span>
            </div>
            <div class="admin-right">
              <span class="status-badge status-{admin.status}">{admin.status}</span>
              <span class="arrow">›</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </main>
</div>

<style>
  .page { min-height: 100vh; }
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
  .back-link:hover { color: var(--color-text); text-decoration: underline; }
  .page-title { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
  .content { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem; }
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
  .empty-title { font-size: 1rem; font-weight: 600; color: var(--color-text); }
  .empty-desc { font-size: 0.9375rem; color: var(--color-text-muted); max-width: 360px; margin: 0; line-height: 1.6; }
  .admin-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .admin-row {
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
  .admin-row:hover { border-color: var(--color-primary); text-decoration: none; }
  .admin-info { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
  .admin-name { font-weight: 600; color: var(--color-text); font-size: 0.9375rem; }
  .admin-meta { font-size: 0.75rem; color: var(--color-text-faint); }
  .admin-right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
  .status-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-pill);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .status-active { background: var(--color-success-bg-soft, #dcfce7); color: var(--color-success-text, #15803d); }
  .status-disabled { background: var(--color-error-bg-soft); color: var(--color-error-text); }
  .arrow { color: var(--color-text-faint); font-size: 1.125rem; flex-shrink: 0; }
  .card { padding: 1.5rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
  .error {
    background: var(--color-error-bg-soft);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-sm);
    color: var(--color-error-text);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
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
  .btn-primary:hover { background: var(--color-primary-hover); text-decoration: none; }
</style>
