<script lang="ts">
  import { goto } from "$app/navigation";
  import { updateVenue, deleteVenue } from "$lib/api";
  import { untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const slugPattern = /^[a-z0-9._~-]+$/;

  let name = $state(untrack(() => data.venue?.name ?? ""));
  let slug = $state(untrack(() => data.venue?.slug ?? ""));
  let timezone = $state(untrack(() => data.venue?.timezone ?? ""));
  let address = $state(untrack(() => data.venue?.address ?? ""));
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let busy = $state(false);
  let deleting = $state(false);

  // SvelteKit reuses this component across sibling params, so re-seed the form
  // when navigating to a *different* venue. Guarded on id so same-venue data
  // refreshes don't wipe in-progress edits.
  let seededVenueId = untrack(() => data.venue?.id);
  $effect(() => {
    const id = data.venue?.id;
    if (id === seededVenueId) return;
    seededVenueId = id;
    untrack(() => {
      name = data.venue?.name ?? "";
      slug = data.venue?.slug ?? "";
      timezone = data.venue?.timezone ?? "";
      address = data.venue?.address ?? "";
      error = null;
      success = null;
    });
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !data.venue) return;

    error = null;
    success = null;

    if (!slugPattern.test(slug)) {
      error = "Slug must use lowercase letters, numbers, and . _ ~ - only.";
      return;
    }
    if (!timezone.trim()) {
      error = "Timezone is required.";
      return;
    }

    busy = true;
    try {
      await updateVenue(data.venue.id, {
        slug,
        name,
        timezone: timezone.trim(),
        address: address.trim() || null,
      });
      success = "Venue updated.";
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update venue.";
    } finally {
      busy = false;
    }
  }

  async function handleDelete() {
    if (deleting || !data.venue) return;
    if (!confirm(`Delete venue "${data.venue.name}"? This cannot be undone.`)) return;

    deleting = true;
    error = null;
    try {
      await deleteVenue(data.venue.id);
      await goto("/venues");
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete venue.";
      deleting = false;
    }
  }
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <a href="/venues" class="back-link">← Venues</a>
        <h1 class="page-title">{data.venue?.name ?? "Venue not found"}</h1>
      </div>
    </div>
  </header>

  <main class="content">
    {#if !data.venue}
      <div class="card">
        <p class="error">Venue not found or you do not have access.</p>
        <a href="/venues" class="cancel-link">← Back to venues</a>
      </div>
    {:else}
      <div class="card">
        {#if error}
          <p class="error">{error}</p>
        {/if}
        {#if success}
          <p class="success">{success}</p>
        {/if}

        <form onsubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              bind:value={name}
              required
              disabled={busy}
              autocomplete="off"
            />
          </label>

          <label>
            Slug
            <span class="hint">Lowercase letters, numbers, and . _ ~ -</span>
            <input
              type="text"
              bind:value={slug}
              required
              disabled={busy}
              pattern="[-a-z0-9._~]+"
              autocomplete="off"
            />
          </label>

          <label>
            Timezone
            <span class="hint">IANA timezone name, e.g. Asia/Bangkok or Europe/London</span>
            <input
              type="text"
              bind:value={timezone}
              required
              disabled={busy}
              autocomplete="off"
            />
          </label>

          <label>
            Address
            <span class="hint optional">Optional</span>
            <textarea bind:value={address} disabled={busy} rows="3"></textarea>
          </label>

          <div class="actions">
            <button type="submit" class="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <a href="/venues" class="cancel-link">Cancel</a>
          </div>
        </form>

        <hr class="divider" />

        <div class="danger-zone">
          <h2 class="danger-title">Danger zone</h2>
          <p class="danger-desc">
            Deleting a venue is permanent and cannot be undone. All boards must be removed first.
          </p>
          <button class="btn-danger" onclick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete venue"}
          </button>
        </div>
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

  .card {
    padding: 1.5rem;
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

  .hint.optional {
    font-style: italic;
  }

  input,
  textarea {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    width: 100%;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
    min-height: 4.5rem;
  }

  input:focus,
  textarea:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  input:disabled,
  textarea:disabled {
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

  .cancel-link {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .cancel-link:hover {
    color: var(--color-text);
    text-decoration: underline;
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

  .success {
    background: var(--color-success-bg-soft, #f0fdf4);
    border: 1px solid var(--color-success-border, #86efac);
    border-radius: var(--radius-sm);
    color: var(--color-success-text, #15803d);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
  }

  .divider {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 1.5rem 0;
  }

  .danger-zone {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .danger-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-error-text, #b91c1c);
  }

  .danger-desc {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .btn-danger {
    align-self: flex-start;
    background: var(--color-error-bg-soft, #fef2f2);
    color: var(--color-error-text, #b91c1c);
    border: 1px solid var(--color-error-border, #fca5a5);
    border-radius: var(--radius-sm);
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--color-error-bg, #fee2e2);
  }

  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
