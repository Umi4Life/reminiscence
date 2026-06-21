<script lang="ts">
  import { goto } from "$app/navigation";
  import { createBoard } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const slugPattern = /^[a-z0-9._~-]+$/;

  let venueId = $state(data.venues.length === 1 ? data.venues[0].id : "");
  let name = $state("");
  let slug = $state("");
  let publicSlug = $state("");
  let description = $state("");
  let slugTouched = $state(false);
  let publicSlugTouched = $state(false);
  let error = $state<string | null>(null);
  let busy = $state(false);

  let selectedVenue = $derived(data.venues.find((venue) => venue.id === venueId));

  function slugFromName(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._~-]/g, "");
  }

  function venuePrefix(): string {
    return selectedVenue ? `${slugFromName(selectedVenue.name)}-` : "";
  }

  function syncAutoSlugs() {
    if (!slugTouched) slug = `${venuePrefix()}${slugFromName(name)}`;
    if (!publicSlugTouched) publicSlug = `${venuePrefix()}${slugFromName(name)}`;
  }

  function onNameInput() {
    syncAutoSlugs();
  }

  function onSlugInput() {
    slugTouched = true;
  }

  function onPublicSlugInput() {
    publicSlugTouched = true;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    error = null;

    if (!venueId) {
      error = "Select a venue.";
      return;
    }
    if (!slugPattern.test(slug)) {
      error = "Admin slug must use lowercase letters, numbers, and . _ ~ - only.";
      return;
    }
    if (!slugPattern.test(publicSlug)) {
      error = "Public slug must use lowercase letters, numbers, and . _ ~ - only.";
      return;
    }

    busy = true;
    try {
      const result = await createBoard({
        venueId,
        slug,
        publicSlug,
        name,
        description: description.trim() || null,
      });
      await goto(`/boards/${result.board.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create board.";
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <a href="/" class="back-link">← Dashboard</a>
        <h1 class="page-title">New board</h1>
      </div>
    </div>
  </header>

  <main class="content">
    <div class="card">
      {#if data.venues.length === 0}
        <p class="error">No venues available. Create a venue before creating a board.</p>
        <div class="actions">
          <a href="/venues/new" class="btn-primary">Create venue</a>
          <a href="/" class="cancel-link">← Back to dashboard</a>
        </div>
      {:else}
        {#if error}
          <p class="error">{error}</p>
        {/if}

        <form onsubmit={handleSubmit}>
          {#if data.venues.length > 1}
            <label>
              Venue
              <select bind:value={venueId} required disabled={busy}>
                <option value="" disabled>Select a venue</option>
                {#each data.venues as venue (venue.id)}
                  <option value={venue.id}>{venue.name}</option>
                {/each}
              </select>
            </label>
          {:else}
            <input type="hidden" bind:value={venueId} />
          {/if}

          <label>
            Name
            <input
              type="text"
              bind:value={name}
              oninput={onNameInput}
              required
              disabled={busy}
              autocomplete="off"
            />
          </label>

          <label>
            Admin slug
            <span class="hint">Lowercase letters, numbers, and . _ ~ -</span>
            <input
              type="text"
              bind:value={slug}
              oninput={onSlugInput}
              required
              disabled={busy}
              pattern="[-a-z0-9._~]+"
              autocomplete="off"
            />
          </label>

          <label>
            Public slug
            <span class="hint">Lowercase letters, numbers, and . _ ~ -</span>
            <input
              type="text"
              bind:value={publicSlug}
              oninput={onPublicSlugInput}
              required
              disabled={busy}
              pattern="[-a-z0-9._~]+"
              autocomplete="off"
            />
          </label>

          <label>
            Description
            <span class="hint optional">Optional</span>
            <textarea bind:value={description} disabled={busy} rows="3"></textarea>
          </label>

          <div class="actions">
            <button type="submit" class="btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create board"}
            </button>
            <a href="/" class="cancel-link">Cancel</a>
          </div>
        </form>
      {/if}
    </div>
  </main>
</div>

<style>
  /* .card (box) comes from @queue-reminiscence/ui/components.css; this page
     overrides only the padding. */
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
  select,
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
  select:focus,
  textarea:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  input:disabled,
  select:disabled,
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
</style>
