<script lang="ts">
  import { goto } from "$app/navigation";
  import { login } from "$lib/api";

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = null;
    busy = true;
    try {
      await login(email, password);
      await goto("/");
    } catch (e) {
      error = e instanceof Error ? e.message : "Invalid email or password.";
    } finally {
      busy = false;
    }
  }
</script>

<main class="login-page">
  <div class="login-card">
    <h1>Admin Login</h1>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <form onsubmit={handleSubmit}>
      <label>
        Email
        <input type="email" name="email" bind:value={email} autocomplete="email" required disabled={busy} />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          bind:value={password}
          autocomplete="current-password"
          required
          disabled={busy}
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  </div>
</main>

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1rem;
  }

  .login-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 2rem;
    width: 100%;
    max-width: 24rem;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
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
  }

  input {
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    width: 100%;
  }

  input:focus {
    outline: 2px solid #2563eb;
    outline-offset: 1px;
  }

  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button {
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 0.375rem;
    padding: 0.625rem 1rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    margin-top: 0.5rem;
  }

  button:hover:not(:disabled) {
    background: #1d4ed8;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
