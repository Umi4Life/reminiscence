<script lang="ts">
  let { onAdd }: { onAdd: (displayName: string) => Promise<string | null> } = $props();

  let displayName = $state("");
  let error = $state<string | null>(null);
  let submitting = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      error = "Please enter a name.";
      return;
    }
    submitting = true;
    error = null;
    const result = await onAdd(name);
    submitting = false;
    if (result) {
      error = result;
    } else {
      displayName = "";
    }
  }
</script>

<form class="form" onsubmit={handleSubmit}>
  <label class="label" for="display-name">Name to show on the board</label>
  <p class="helper">Use any name people can recognize you by.</p>
  <input
    id="display-name"
    class="input"
    type="text"
    bind:value={displayName}
    placeholder="Your name"
    autocomplete="off"
    disabled={submitting}
  />
  {#if error}
    <p class="error">{error}</p>
  {/if}
  <button class="submit-btn" type="submit" disabled={submitting || !displayName.trim()}>
    {submitting ? "Joining…" : "Join queue"}
  </button>
</form>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .helper {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .input {
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: 0.9375rem;
    color: var(--color-text);
    background: var(--color-surface);
    width: 100%;
    outline: none;
    margin-top: 0.25rem;
  }

  .input:focus {
    border-color: var(--color-primary);
    box-shadow: var(--ring-primary);
  }

  .input:disabled {
    background: var(--color-bg);
    color: var(--color-text-faint);
  }

  .error {
    color: var(--color-danger);
    font-size: 0.875rem;
  }

  .submit-btn {
    padding: 0.625rem 1.25rem;
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    align-self: flex-start;
    margin-top: 0.25rem;
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
