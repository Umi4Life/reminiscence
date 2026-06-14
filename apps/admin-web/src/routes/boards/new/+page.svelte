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

  function slugFromName(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._~-]/g, "");
  }

  function onNameInput() {
    if (!slugTouched) slug = slugFromName(name);
    if (!publicSlugTouched) publicSlug = slugFromName(name);
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
        <p class="error">No venues available. Contact your organisation owner for access.</p>
        <a href="/" class="cancel-link">← Back to dashboard</a>
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
              pattern="[a-z0-9._~-]+"
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
              pattern="[a-z0-9._~-]+"
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

  .page-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #111827;
  }

  .content {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }

  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
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
    color: #374151;
  }

  .hint {
    font-size: 0.75rem;
    font-weight: 400;
    color: #6b7280;
  }

  .hint.optional {
    font-style: italic;
  }

  input,
  select,
  textarea {
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
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
    outline: 2px solid #2563eb;
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
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 0.375rem;
    padding: 0.625rem 1rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cancel-link {
    font-size: 0.875rem;
    color: #6b7280;
    text-decoration: none;
  }

  .cancel-link:hover {
    color: #111827;
    text-decoration: underline;
  }

  .error {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: 0.375rem;
    color: #991b1b;
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
  }
</style>
