<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount, untrack } from "svelte";
  import { createVenue } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const slugPattern = /^[a-z0-9._~-]+$/;
  const timezoneOptions =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  let organizationId = $state(
    untrack(() => (data.organizations.length === 1 ? data.organizations[0].id : "")),
  );
  let name = $state("");
  let slug = $state("");
  let timezone = $state("");
  let address = $state("");
  let slugTouched = $state(false);
  let error = $state<string | null>(null);
  let busy = $state(false);

  onMount(() => {
    if (!timezone.trim()) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        timezone = detected;
      }
    }
  });

  function slugFromName(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._~-]/g, "");
  }

  function onNameInput() {
    if (!slugTouched) slug = slugFromName(name);
  }

  function onSlugInput() {
    slugTouched = true;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    error = null;

    if (!organizationId) {
      error = "Select an organisation.";
      return;
    }
    if (!slugPattern.test(slug)) {
      error = "Slug must use lowercase letters, numbers, and . _ ~ - only.";
      return;
    }
    if (!timezone.trim()) {
      error = "Timezone is required.";
      return;
    }

    busy = true;
    try {
      const result = await createVenue({
        organizationId,
        slug,
        name,
        timezone: timezone.trim(),
        address: address.trim() || null,
      });
      await goto(`/venues/${result.venue.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create venue.";
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <a href="/venues" class="back-link">← Venues</a>
        <h1 class="page-title">New venue</h1>
      </div>
    </div>
  </header>

  <main class="content">
    <div class="card">
      {#if data.organizations.length === 0}
        <p class="error">No organisations available. Contact your super admin.</p>
        <a href="/venues" class="cancel-link">← Back to venues</a>
      {:else}
        {#if error}
          <p class="error">{error}</p>
        {/if}

        <form onsubmit={handleSubmit}>
          {#if data.organizations.length > 1}
            <label>
              Organisation
              <select bind:value={organizationId} required disabled={busy}>
                <option value="" disabled>Select an organisation</option>
                {#each data.organizations as org (org.id)}
                  <option value={org.id}>{org.name}</option>
                {/each}
              </select>
            </label>
          {:else}
            <input type="hidden" bind:value={organizationId} />
          {/if}

          <label>
            Name
            <input
              type="text"
              bind:value={name}
              oninput={onNameInput}
              required
              disabled={busy}
              autocomplete="off"
            />
          </label>

          <label>
            Slug
            <span class="hint">Lowercase letters, numbers, and . _ ~ -</span>
            <input
              type="text"
              bind:value={slug}
              oninput={onSlugInput}
              required
              disabled={busy}
              pattern="[-a-z0-9._~]+"
              autocomplete="off"
            />
          </label>

          <label>
            Timezone
            <span class="hint">IANA timezone name, e.g. Asia/Bangkok or Europe/London</span>
            <input
              type="text"
              bind:value={timezone}
              required
              disabled={busy}
              placeholder="Asia/Bangkok"
              autocomplete="off"
              list="timezone-options"
            />
            <datalist id="timezone-options">
              {#each timezoneOptions as zone}
                <option value={zone}></option>
              {/each}
            </datalist>
          </label>

          <label>
            Address
            <span class="hint optional">Optional</span>
            <textarea bind:value={address} disabled={busy} rows="3"></textarea>
          </label>

          <div class="actions">
            <button type="submit" class="btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create venue"}
            </button>
            <a href="/venues" class="cancel-link">Cancel</a>
          </div>
        </form>
      {/if}
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
  }

  .back-link {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-decoration: none;
    display: block;
    margin-bottom: 0.375rem;
  }

  .back-link:hover {
    color: var(--color-text);
    text-decoration: underline;
  }

  .page-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .content {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }

  .card {
    padding: 1.5rem;
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

  .hint.optional {
    font-style: italic;
  }

  input,
  select,
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
  select:focus,
  textarea:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  input:disabled,
  select:disabled,
  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.625rem 1rem;
    font-size: 1rem;
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

  .cancel-link {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .cancel-link:hover {
    color: var(--color-text);
    text-decoration: underline;
  }

  .error {
    background: var(--color-error-bg-soft);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-sm);
    color: var(--color-error-text);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
  }
</style>
