<script lang="ts">
  import { goto } from "$app/navigation";
  import { changePassword } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const PASSWORD_MIN_LENGTH = 8;

  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");
  let error = $state<string | null>(null);
  let success = $state(false);
  let busy = $state(false);

  function validate(): string | null {
    if (!currentPassword) return "Current password is required.";
    if (newPassword.length < PASSWORD_MIN_LENGTH)
      return `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (newPassword !== confirmPassword) return "New password and confirmation do not match.";
    if (newPassword === currentPassword)
      return "New password must differ from the current password.";
    return null;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const validationError = validate();
    if (validationError) {
      error = validationError;
      return;
    }
    error = null;
    success = false;
    busy = true;
    try {
      await changePassword(currentPassword, newPassword);
      success = true;
      currentPassword = "";
      newPassword = "";
      confirmPassword = "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Password change failed.";
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <p class="header-label">Admin</p>
        <h1 class="header-name">{data.session?.admin.displayName ?? ""}</h1>
      </div>
      <a href="/" class="back-btn">← Dashboard</a>
    </div>
  </header>

  <main class="content">
    <div class="card">
      <h2 class="card-title">Change Password</h2>

      {#if success}
        <div class="success-box" role="status">
          Password changed successfully. Your other sessions have been signed out.
        </div>
      {/if}

      {#if error}
        <div class="error-box" role="alert">{error}</div>
      {/if}

      <form onsubmit={handleSubmit} novalidate>
        <label>
          Current password
          <input
            type="password"
            name="current-password"
            bind:value={currentPassword}
            autocomplete="current-password"
            required
            disabled={busy}
          />
        </label>

        <label>
          New password
          <span class="hint">At least {PASSWORD_MIN_LENGTH} characters</span>
          <input
            type="password"
            name="new-password"
            bind:value={newPassword}
            autocomplete="new-password"
            required
            disabled={busy}
          />
        </label>

        <label>
          Confirm new password
          <input
            type="password"
            name="confirm-password"
            bind:value={confirmPassword}
            autocomplete="new-password"
            required
            disabled={busy}
          />
        </label>

        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  </main>
</div>

<style>
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .header-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: 0.125rem;
  }

  .header-name {
    font-size: 1.375rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .back-btn {
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    color: var(--color-text-strong);
    text-decoration: none;
    font-weight: 500;
    white-space: nowrap;
  }

  .back-btn:hover {
    background: var(--color-bg);
    text-decoration: none;
  }

  .content {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    max-width: 28rem;
  }

  .card-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 1.25rem;
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

  input {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    width: 100%;
    background: var(--color-bg);
    color: var(--color-text);
  }

  input:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button[type="submit"] {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.625rem 1rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    margin-top: 0.5rem;
    align-self: flex-start;
  }

  button[type="submit"]:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  button[type="submit"]:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-box {
    background: var(--color-error-bg-soft);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-sm);
    color: var(--color-error-text);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
  }

  .success-box {
    background: var(--color-success-bg-soft);
    border: 1px solid var(--color-success-border);
    border-radius: var(--radius-sm);
    color: var(--color-success-text);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
  }
</style>
