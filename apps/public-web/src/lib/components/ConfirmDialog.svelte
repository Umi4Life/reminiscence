<script lang="ts">
  let {
    message,
    onConfirm,
    onCancel,
  }: {
    message: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
  } = $props();

  let confirming = $state(false);

  async function confirm() {
    confirming = true;
    await onConfirm();
    confirming = false;
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
      <button class="cancel-btn" type="button" onclick={onCancel} disabled={confirming}>
        Cancel
      </button>
      <button class="confirm-btn" type="button" onclick={confirm} disabled={confirming}>
        {confirming ? "Removing…" : "Remove"}
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
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    max-width: 360px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  }

  .message {
    font-size: 0.9375rem;
    color: var(--color-text);
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
    color: var(--color-text-strong);
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 500;
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--color-bg);
  }

  .confirm-btn {
    padding: 0.5rem 1rem;
    font-size: 0.9375rem;
    color: #fff;
    background: var(--color-danger);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 500;
  }

  .confirm-btn:hover:not(:disabled) {
    background: var(--color-danger-hover);
  }

  .confirm-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
