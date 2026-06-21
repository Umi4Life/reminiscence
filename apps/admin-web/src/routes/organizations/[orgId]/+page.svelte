<script lang="ts">
  import { goto } from "$app/navigation";
  import { updateOrganization, deleteOrganization, type OrganizationSummary } from "$lib/api";
  import { untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const slugPattern = /^[a-z0-9._~-]+$/;

  let organization = $state<OrganizationSummary | null>(untrack(() => data.organization));

  let editName = $state(untrack(() => data.organization?.name ?? ""));
  let editSlug = $state(untrack(() => data.organization?.slug ?? ""));
  let editError = $state<string | null>(null);
  let editBusy = $state(false);

  // Re-seed when navigating to a *different* org (component reused across params).
  let seededOrgId = untrack(() => data.organization?.id);
  $effect(() => {
    const id = data.organization?.id;
    if (id === seededOrgId) return;
    seededOrgId = id;
    untrack(() => {
      organization = data.organization;
      editName = data.organization?.name ?? "";
      editSlug = data.organization?.slug ?? "";
      editError = null;
    });
  });

  let deleteBusy = $state(false);
  let deleteError = $state<string | null>(null);
  let confirmDelete = $state(false);

  async function handleEdit(event: SubmitEvent) {
    event.preventDefault();
    if (editBusy || !organization) return;

    editError = null;

    if (!slugPattern.test(editSlug)) {
      editError = "Slug must use lowercase letters, numbers, and . _ ~ - only.";
      return;
    }

    const patch: { slug?: string; name?: string } = {};
    if (editSlug !== organization.slug) patch.slug = editSlug;
    if (editName !== organization.name) patch.name = editName;

    if (Object.keys(patch).length === 0) {
      editError = "No changes to save.";
      return;
    }

    editBusy = true;
    try {
      const result = await updateOrganization(organization.id, patch);
      organization = result.organization;
      editName = result.organization.name;
      editSlug = result.organization.slug;
    } catch (e) {
      editError = e instanceof Error ? e.message : "Failed to update organization.";
    } finally {
      editBusy = false;
    }
  }

  async function handleDelete() {
    if (deleteBusy || !organization) return;
    deleteError = null;
    deleteBusy = true;
    try {
      await deleteOrganization(organization.id);
      await goto("/organizations");
    } catch (e) {
      deleteError = e instanceof Error ? e.message : "Failed to delete organization.";
      confirmDelete = false;
    } finally {
      deleteBusy = false;
    }
  }
</script>

{#if !organization}
  <div class="not-found-container">
    <div class="card">
      <h1 class="not-found-title">Organization not found</h1>
      <p class="not-found-msg">This organization doesn't exist or you don't have access to it.</p>
      <a href="/organizations" class="back-link">← Back to organizations</a>
    </div>
  </div>
{:else}
  <div class="page">
    <header class="header">
      <div class="header-inner">
        <div>
          <a href="/organizations" class="back-link">← Organizations</a>
          <h1 class="page-title">{organization.name}</h1>
          <p class="org-slug">{organization.slug}</p>
        </div>
      </div>
    </header>

    <main class="content">
      <section class="card section">
        <h2 class="section-title">Edit organization</h2>

        {#if editError}
          <p class="error">{editError}</p>
        {/if}

        <form onsubmit={handleEdit}>
          <label>
            Name
            <input
              type="text"
              bind:value={editName}
              required
              disabled={editBusy}
              autocomplete="off"
            />
          </label>

          <label>
            Slug
            <span class="hint">Lowercase letters, numbers, and . _ ~ -</span>
            <input
              type="text"
              bind:value={editSlug}
              required
              disabled={editBusy}
              pattern="[-a-z0-9._~]+"
              autocomplete="off"
            />
          </label>

          <div class="actions">
            <button type="submit" class="btn-primary" disabled={editBusy}>
              {editBusy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      <section class="card section danger-zone">
        <h2 class="section-title danger-title">Danger zone</h2>

        {#if deleteError}
          <p class="error">{deleteError}</p>
        {/if}

        {#if confirmDelete}
          <p class="delete-confirm-msg">
            Are you sure you want to delete <strong>{organization.name}</strong>? This cannot be
            undone. The organization must have no venues.
          </p>
          <div class="actions">
            <button class="btn-danger" onclick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              class="btn-secondary"
              onclick={() => {
                confirmDelete = false;
              }}
              disabled={deleteBusy}
            >
              Cancel
            </button>
          </div>
        {:else}
          <button
            class="btn-danger"
            onclick={() => {
              confirmDelete = true;
            }}
          >
            Delete organization
          </button>
        {/if}
      </section>
    </main>
  </div>
{/if}

<style>
  .page {
    min-height: 100vh;
  }

  .not-found-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
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

  .header {
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 1rem;
  }

  .header-inner {
    max-width: 720px;
    margin: 0 auto;
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

  .org-slug {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-top: 0.125rem;
  }

  .content {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section {
    padding: 1.5rem;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 1rem;
  }

  .danger-zone {
    border-color: var(--color-error-border);
  }

  .danger-title {
    color: var(--color-error-text);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-strong);
  }

  .hint {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--color-text-muted);
  }

  input {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    width: 100%;
    font-family: inherit;
  }

  input:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.625rem 1rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-danger {
    background: var(--color-error);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-danger:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--color-surface);
    color: var(--color-text-strong);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-bg);
  }

  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .delete-confirm-msg {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    margin-bottom: 1rem;
    line-height: 1.6;
  }

  .error {
    background: var(--color-error-bg-soft);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-sm);
    color: var(--color-error-text);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
  }
</style>
