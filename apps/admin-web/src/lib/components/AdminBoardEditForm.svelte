<script lang="ts">
  import { deleteBoard, updateBoard, type BoardSummary } from "$lib/api";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { goto } from "$app/navigation";

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
  let showDeleteConfirm = $state(false);
  let deleteError = $state<string | null>(null);

  async function handleDelete() {
    showDeleteConfirm = false;
    busy = true;
    deleteError = null;
    try {
      await deleteBoard(board.id);
      goto("/");
    } catch (e) {
      deleteError = e instanceof Error ? e.message : "Failed to delete board.";
    } finally {
      busy = false;
    }
  }

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

<section class="section danger-zone">
  <h2 class="section-title">Danger zone</h2>

  {#if deleteError}
    <div class="error-box">{deleteError}</div>
  {/if}

  <button
    type="button"
    class="btn-danger"
    disabled={busy}
    onclick={() => { showDeleteConfirm = true; }}
  >
    Delete board
  </button>
</section>

{#if showDeleteConfirm}
  <ConfirmDialog
    message={`Permanently delete "${board.name}"? This removes the board, queue, events, and access credentials. This cannot be undone.`}
    confirmLabel="Delete board"
    onConfirm={handleDelete}
    onCancel={() => { showDeleteConfirm = false; }}
  />
{/if}

<style>
  /* .section, .section-title, .error-box, .success-box come from
     @queue-reminiscence/ui/components.css. */
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
    color: var(--color-text-strong);
  }

  .field-value {
    font-size: 0.9375rem;
    color: var(--color-text);
    padding: 0.5rem 0;
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

  .btn-primary {
    align-self: flex-start;
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.875rem;
    font-size: 0.875rem;
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

  .danger-zone {
    border-color: var(--color-error-border);
  }

  .btn-danger {
    background: var(--color-surface);
    color: var(--color-danger);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.875rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--color-error-bg-soft);
  }

  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
