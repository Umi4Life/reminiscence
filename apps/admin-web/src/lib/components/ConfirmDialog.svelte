<script lang="ts">
  let {
    message,
    confirmLabel = "Confirm",
    onConfirm,
    onCancel,
  }: {
    message: string;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
  } = $props();

  let busy = $state(false);

  async function confirm() {
    busy = true;
    await onConfirm();
    busy = false;
  }
</script>

<div class="backdrop" role="presentation" onclick={onCancel}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm action"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <p class="message">{message}</p>
    <div class="actions">
      <button class="cancel-btn" type="button" onclick={onCancel} disabled={busy}>
        Cancel
      </button>
      <button class="confirm-btn" type="button" onclick={confirm} disabled={busy}>
        {busy ? "Working…" : confirmLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 1rem;
  }

  .dialog {
    background: #fff;
    border-radius: 0.75rem;
    padding: 1.5rem;
    max-width: 360px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  }

  .message {
    font-size: 0.9375rem;
    color: #111827;
    margin-bottom: 1.25rem;
    line-height: 1.6;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .cancel-btn {
    padding: 0.5rem 1rem;
    font-size: 0.9375rem;
    color: #374151;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 500;
  }

  .cancel-btn:hover:not(:disabled) {
    background: #f9fafb;
  }

  .confirm-btn {
    padding: 0.5rem 1rem;
    font-size: 0.9375rem;
    color: #fff;
    background: #dc2626;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 500;
  }

  .confirm-btn:hover:not(:disabled) {
    background: #b91c1c;
  }

  .confirm-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
