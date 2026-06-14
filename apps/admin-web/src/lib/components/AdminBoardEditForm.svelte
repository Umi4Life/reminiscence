<script lang="ts">
  import { updateBoard, type BoardSummary } from "$lib/api";

  let {
    board,
    venueName = null,
    onBoardUpdated,
  }: {
    board: BoardSummary;
    venueName?: string | null;
    onBoardUpdated: (board: BoardSummary) => void;
  } = $props();

  const slugPattern = /^[a-z0-9._~-]+$/;

  let name = $state(board.name);
  let slug = $state(board.slug);
  let publicSlug = $state(board.publicSlug);
  let description = $state(board.description ?? "");
  let error = $state<string | null>(null);
  let success = $state(false);
  let busy = $state(false);
  let successTimer: ReturnType<typeof setTimeout> | null = null;

  function showSuccess() {
    success = true;
    if (successTimer) clearTimeout(successTimer);
    successTimer = setTimeout(() => {
      success = false;
      successTimer = null;
    }, 2500);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    error = null;
    success = false;

    if (!slugPattern.test(slug)) {
      error = "Admin slug must use lowercase letters, numbers, and . _ ~ - only.";
      return;
    }
    if (!slugPattern.test(publicSlug)) {
      error = "Public slug must use lowercase letters, numbers, and . _ ~ - only.";
      return;
    }

    const patch: {
      name?: string;
      slug?: string;
      publicSlug?: string;
      description?: string | null;
    } = {};

    if (name !== board.name) patch.name = name;
    if (slug !== board.slug) patch.slug = slug;
    if (publicSlug !== board.publicSlug) patch.publicSlug = publicSlug;
    const descValue = description.trim() || null;
    if (descValue !== board.description) patch.description = descValue;

    if (Object.keys(patch).length === 0) {
      showSuccess();
      return;
    }

    busy = true;
    try {
      const result = await updateBoard(board.id, patch);
      onBoardUpdated(result.board);
      showSuccess();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update board.";
    } finally {
      busy = false;
    }
  }
</script>

<section class="section">
  <h2 class="section-title">Edit board</h2>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  {#if success}
    <div class="success-box" role="status">Board updated</div>
  {/if}

  <form onsubmit={handleSubmit}>
    {#if venueName}
      <div class="read-only-field">
        <span class="field-label">Venue</span>
        <span class="field-value">{venueName}</span>
      </div>
    {/if}

    <label>
      Name
      <input type="text" bind:value={name} required disabled={busy} autocomplete="off" />
    </label>

    <label>
      Admin slug
      <span class="hint">Lowercase letters, numbers, and . _ ~ -</span>
      <input
        type="text"
        bind:value={slug}
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

    <button type="submit" class="btn-primary" disabled={busy}>
      {busy ? "Saving…" : "Save changes"}
    </button>
  </form>
</section>

<style>
  .section {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #374151;
    margin-bottom: 1rem;
  }

  .error-box {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: 0.375rem;
    color: #991b1b;
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
  }

  .success-box {
    background: #ecfdf5;
    border: 1px solid #6ee7b7;
    border-radius: 0.375rem;
    color: #065f46;
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .read-only-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .field-value {
    font-size: 0.9375rem;
    color: #111827;
    padding: 0.5rem 0;
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
  textarea:focus {
    outline: 2px solid #2563eb;
    outline-offset: 1px;
  }

  input:disabled,
  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    align-self: flex-start;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 0.375rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.875rem;
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
</style>
