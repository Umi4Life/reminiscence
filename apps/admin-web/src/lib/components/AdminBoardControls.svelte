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
  import { copyTextToClipboard } from "$lib/copy-to-clipboard";
  import { API_BASE_URL, PUBLIC_APP_URL } from "$lib/env";

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
  let copyFeedback = $state<string | null>(null);
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  function showCopyFeedback(message: string) {
    copyFeedback = message;
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      copyFeedback = null;
      copyFeedbackTimer = null;
    }, 2000);
  }

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
    const url = `${PUBLIC_APP_URL}/b/${board.publicSlug}`;
    showCopyFeedback(
      copyTextToClipboard(url) ? "Public URL copied" : "Copy failed — select the URL manually",
    );
  }

  function copyAccessUrl() {
    if (!rotateResult) return;
    showCopyFeedback(
      copyTextToClipboard(rotateResult.credential.accessUrl)
        ? "Access URL copied"
        : "Copy failed — select the URL above",
    );
  }

  function accessCodeFromUrl(accessUrl: string): string | null {
    const qIndex = accessUrl.indexOf("/q/");
    if (qIndex === -1) return null;

    let segment = accessUrl.slice(qIndex + 3);
    const hashIdx = segment.indexOf("#");
    if (hashIdx !== -1) segment = segment.slice(0, hashIdx);
    const queryIdx = segment.indexOf("?");
    if (queryIdx !== -1) segment = segment.slice(0, queryIdx);

    const code = segment.split("/")[0];
    return code || null;
  }

  let rotateAccessCode = $derived(
    rotateResult
      ? accessCodeFromUrl(rotateResult.credential.accessUrl)
      : null,
  );

  function openQrInNewTab() {
    if (rotateAccessCode) {
      window.open(`${API_BASE_URL}/qr/${rotateAccessCode}.svg`, "_blank");
    }
  }

  async function downloadPng() {
    if (!rotateAccessCode) return;
    const response = await fetch(`${API_BASE_URL}/qr/${rotateAccessCode}.svg`);
    const svgText = await response.text();
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const svgUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(svgUrl);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "queue-access-qr.png";
      a.click();
    };
    img.src = svgUrl;
  }
</script>

<section class="section">
  <h2 class="section-title">Controls</h2>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  {#if copyFeedback}
    <div class="success-box" role="status">{copyFeedback}</div>
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
      {#if rotateAccessCode}
        <img
          class="rotate-qr"
          src="{API_BASE_URL}/qr/{rotateAccessCode}.svg"
          alt="Queue access QR"
          width="200"
          height="200"
        />
        <div class="rotate-qr-actions">
          <button
            type="button"
            class="btn btn-secondary rotate-qr-btn"
            onclick={openQrInNewTab}
          >
            Open QR in new tab
          </button>
          <a
            class="btn btn-secondary rotate-qr-btn"
            href="{API_BASE_URL}/qr/{rotateAccessCode}.svg"
            download="queue-access-qr.svg"
          >
            Download SVG
          </a>
          <button
            type="button"
            class="btn btn-secondary rotate-qr-btn"
            onclick={downloadPng}
          >
            Download PNG
          </button>
        </div>
        <p class="rotate-qr-help">
          Display or print this QR for visitors. The previous QR stops working
          immediately.
        </p>
      {/if}
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
  /* .section, .section-title, .error-box, .success-box come from
     @queue-reminiscence/ui/components.css. */
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.5rem 0.875rem;
    border-radius: var(--radius-sm);
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
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-danger {
    background: var(--color-danger);
    color: var(--color-on-primary);
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--color-danger-hover);
  }

  .btn-secondary {
    background: var(--color-surface-raised);
    color: var(--color-text-strong);
    border: 1px solid var(--color-border-strong);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-border-strong);
  }

  .rotate-result {
    margin-top: 1rem;
    background: var(--color-info-bg);
    border: 1px solid var(--color-info-border);
    border-radius: var(--radius-md);
    padding: 0.875rem 1rem;
  }

  .rotate-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-info-text);
    margin-bottom: 0.375rem;
  }

  .one-time {
    font-weight: 400;
    color: var(--color-info-text-soft);
  }

  .rotate-url {
    font-size: 0.875rem;
    color: var(--color-text);
    word-break: break-all;
    margin-bottom: 0.25rem;
    font-family: monospace;
  }

  .rotate-qr {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0.75rem auto 0;
    /* White backing is intentional — QR codes need a light quiet zone to scan. */
    background: #fff;
    padding: 0.5rem;
    border-radius: var(--radius-sm);
  }

  .rotate-qr-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }

  .rotate-qr-help {
    font-size: 0.8125rem;
    color: var(--color-info-text-soft);
    margin: 0 0 0.75rem;
    text-align: center;
  }

  .rotate-qr-btn {
    font-size: 0.8125rem;
    padding: 0.375rem 0.75rem;
    text-decoration: none;
    display: inline-block;
  }

  .rotate-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-bottom: 0.75rem;
  }

  .copy-access-btn {
    font-size: 0.8125rem;
    padding: 0.375rem 0.75rem;
  }
</style>
