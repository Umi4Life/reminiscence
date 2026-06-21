<script lang="ts">
  import { deleteBoard, type BoardSummary } from "$lib/api";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { goto } from "$app/navigation";

  let { board }: { board: BoardSummary } = $props();

  let busy = $state(false);
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
</script>

<section class="section danger-zone">
  <h2 class="section-title">Danger zone</h2>

  {#if deleteError}
    <div class="error-box">{deleteError}</div>
  {/if}

  <button
    type="button"
    class="btn-danger"
    disabled={busy}
    onclick={() => {
      showDeleteConfirm = true;
    }}
  >
    Delete board
  </button>
</section>

{#if showDeleteConfirm}
  <ConfirmDialog
    message={`Permanently delete "${board.name}"? This removes the board, queue, events, and access credentials. This cannot be undone.`}
    confirmLabel="Delete board"
    onConfirm={handleDelete}
    onCancel={() => {
      showDeleteConfirm = false;
    }}
  />
{/if}

<style>
  /* .section, .section-title, .error-box come from
     @queue-reminiscence/ui/components.css. */
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
