<script lang="ts">
  import {
    openBoard,
    closeBoard,
    resetBoard,
    rotateAccessCredential,
    type BoardSummary,
    type RotateResult,
  } from "$lib/api";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  let {
    board,
    onBoardUpdated,
    onRefreshEvents,
  }: {
    board: BoardSummary;
    onBoardUpdated: (board: BoardSummary) => void;
    onRefreshEvents: () => void;
  } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);
  let rotateResult = $state<RotateResult | null>(null);

  type PendingConfirm = {
    message: string;
    confirmLabel: string;
    action: () => Promise<void>;
  };
  let pending = $state<PendingConfirm | null>(null);

  function requireConfirm(cfg: PendingConfirm) {
    error = null;
    pending = cfg;
  }

  function cancelConfirm() {
    pending = null;
  }

  async function runOp(op: () => Promise<{ board: BoardSummary }>) {
    busy = true;
    error = null;
    try {
      const result = await op();
      onBoardUpdated(result.board);
      onRefreshEvents();
    } catch (e) {
      error = e instanceof Error ? e.message : "Operation failed.";
    } finally {
      busy = false;
      pending = null;
    }
  }

  function doOpen() {
    runOp(() => openBoard(board.id));
  }

  function askClose() {
    requireConfirm({
      message: "Close this board? Visitors will see it as closed.",
      confirmLabel: "Close board",
      action: () => runOp(() => closeBoard(board.id)),
    });
  }

  function askReset() {
    requireConfirm({
      message: "Reset the queue? This will clear all active queue entries.",
      confirmLabel: "Reset queue",
      action: () => runOp(() => resetBoard(board.id)),
    });
  }

  function askRotate() {
    requireConfirm({
      message: "Rotate the QR access link? The current QR code will stop working immediately.",
      confirmLabel: "Rotate link",
      action: async () => {
        busy = true;
        error = null;
        try {
          const result = await rotateAccessCredential(board.id);
          onBoardUpdated(result.board);
          rotateResult = result;
          onRefreshEvents();
        } catch (e) {
          error = e instanceof Error ? e.message : "Rotation failed.";
        } finally {
          busy = false;
          pending = null;
        }
      },
    });
  }

  function copyPublicUrl() {
    const url = `${window.location.origin}/b/${board.publicSlug}`;
    navigator.clipboard.writeText(url);
  }

  function copyAccessUrl() {
    if (rotateResult) {
      navigator.clipboard.writeText(rotateResult.credential.accessUrl);
    }
  }
</script>

<section class="section">
  <h2 class="section-title">Controls</h2>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  <div class="controls">
    {#if board.status === "closed"}
      <button class="btn btn-primary" onclick={doOpen} disabled={busy}>
        Open board
      </button>
    {:else}
      <button class="btn btn-danger" onclick={askClose} disabled={busy}>
        Close board
      </button>
    {/if}

    <button class="btn btn-secondary" onclick={askReset} disabled={busy}>
      Reset queue
    </button>

    <button class="btn btn-secondary" onclick={askRotate} disabled={busy}>
      Rotate QR link
    </button>

    <button class="btn btn-secondary" onclick={copyPublicUrl} disabled={busy}>
      Copy public URL
    </button>
  </div>

  {#if rotateResult}
    <div class="rotate-result">
      <p class="rotate-label">New access URL <span class="one-time">(shown once)</span></p>
      <p class="rotate-url">{rotateResult.credential.accessUrl}</p>
      <p class="rotate-hint">Preview: <code>{rotateResult.credential.tokenPreview}</code></p>
      <button class="btn btn-secondary copy-access-btn" onclick={copyAccessUrl}>
        Copy access URL
      </button>
    </div>
  {/if}
</section>

{#if pending}
  <ConfirmDialog
    message={pending.message}
    confirmLabel={pending.confirmLabel}
    onConfirm={pending.action}
    onCancel={cancelConfirm}
  />
{/if}

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

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.5rem 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #2563eb;
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-danger {
    background: #dc2626;
    color: #fff;
  }

  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .rotate-result {
    margin-top: 1rem;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 0.5rem;
    padding: 0.875rem 1rem;
  }

  .rotate-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: #1d4ed8;
    margin-bottom: 0.375rem;
  }

  .one-time {
    font-weight: 400;
    color: #3b82f6;
  }

  .rotate-url {
    font-size: 0.875rem;
    color: #111827;
    word-break: break-all;
    margin-bottom: 0.25rem;
    font-family: monospace;
  }

  .rotate-hint {
    font-size: 0.8125rem;
    color: #6b7280;
    margin-bottom: 0.75rem;
  }

  .copy-access-btn {
    font-size: 0.8125rem;
    padding: 0.375rem 0.75rem;
  }
</style>
