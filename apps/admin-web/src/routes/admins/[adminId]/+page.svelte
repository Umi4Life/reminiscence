<script lang="ts">
  import { updateAdmin, resetAdminPassword, assignMembership, revokeMembership, getAdmin, listAdmins, type AdminUserSummary, type OrganizationSummary, type VenueSummary } from "$lib/api";
  import { untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Admin state — update when mutations succeed
  let admin = $state<AdminUserSummary | null>(untrack(() => data.admin));

  // Edit display name
  let displayName = $state(untrack(() => data.admin?.displayName ?? ""));
  let editError = $state<string | null>(null);
  let editSuccess = $state<string | null>(null);
  let editBusy = $state(false);

  // Reset password
  let newPassword = $state("");
  let resetError = $state<string | null>(null);
  let resetSuccess = $state<string | null>(null);
  let resetBusy = $state(false);

  // Status toggle
  let statusBusy = $state(false);
  let statusError = $state<string | null>(null);

  // Assign membership
  let assignOrgId = $state("");
  let assignVenueId = $state("");
  let assignRole = $state<"org_owner" | "venue_manager" | "venue_staff">("venue_staff");
  let assignError = $state<string | null>(null);
  let assignBusy = $state(false);

  // SvelteKit reuses this component across sibling params; re-seed when
  // navigating to a *different* admin (guarded on id so same-admin refreshes
  // don't clobber local mutation results or in-progress edits).
  let seededAdminId = untrack(() => data.admin?.id);
  $effect(() => {
    const id = data.admin?.id;
    if (id === seededAdminId) return;
    seededAdminId = id;
    untrack(() => {
      admin = data.admin;
      displayName = data.admin?.displayName ?? "";
      editError = null;
      editSuccess = null;
      resetError = null;
      resetSuccess = null;
    });
  });

  let canManageAdmins = $derived(
    data.session?.admin.isSuperAdmin ||
      (data.session?.memberships.some(
        (m) => m.role === "org_owner" || m.role === "venue_manager",
      ) ??
        false),
  );

  // Self-lockout guard: you cannot disable or revoke your own account. The
  // server enforces this too; this just keeps the dangerous controls out of reach.
  let isSelf = $derived(!!admin && data.session?.admin.id === admin.id);

  let venuesForOrg = $derived(
    assignOrgId ? data.venues.filter((v: VenueSummary) => v.organizationId === assignOrgId) : []
  );

  async function refreshAdmin(adminId: string): Promise<AdminUserSummary | null> {
    try {
      if (data.session?.admin.isSuperAdmin) {
        const result = await getAdmin(adminId);
        return result.admin;
      } else {
        const result = await listAdmins();
        return result.admins.find((a) => a.id === adminId) ?? null;
      }
    } catch {
      return null;
    }
  }

  async function handleEditSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (editBusy || !admin) return;
    editError = null;
    editSuccess = null;
    editBusy = true;
    try {
      const result = await updateAdmin(admin.id, { displayName: displayName.trim() });
      admin = result.admin;
      editSuccess = "Admin updated.";
    } catch (e) {
      editError = e instanceof Error ? e.message : "Failed to update admin.";
    } finally {
      editBusy = false;
    }
  }

  async function handleToggleStatus() {
    if (statusBusy || !admin || admin.isSuperAdmin || isSelf) return;
    statusError = null;
    statusBusy = true;
    try {
      const newStatus = admin.status === "active" ? "disabled" : "active";
      const result = await updateAdmin(admin.id, { status: newStatus });
      admin = result.admin;
    } catch (e) {
      statusError = e instanceof Error ? e.message : "Failed to update status.";
    } finally {
      statusBusy = false;
    }
  }

  async function handleResetPassword(event: SubmitEvent) {
    event.preventDefault();
    if (resetBusy || !admin) return;
    if (newPassword.length < 8) {
      resetError = "Password must be at least 8 characters.";
      return;
    }
    resetError = null;
    resetSuccess = null;
    resetBusy = true;
    try {
      await resetAdminPassword(admin.id, newPassword);
      newPassword = "";
      resetSuccess = "Password reset successfully.";
    } catch (e) {
      resetError = e instanceof Error ? e.message : "Failed to reset password.";
    } finally {
      resetBusy = false;
    }
  }

  async function handleAssignMembership(event: SubmitEvent) {
    event.preventDefault();
    if (assignBusy || !admin) return;
    if (!assignOrgId) { assignError = "Select an organisation."; return; }
    assignError = null;
    assignBusy = true;
    try {
      await assignMembership(admin.id, {
        organizationId: assignOrgId,
        venueId: assignVenueId || null,
        role: assignRole,
      });
      admin = (await refreshAdmin(admin.id)) ?? admin;
      assignOrgId = "";
      assignVenueId = "";
      assignRole = "venue_staff";
    } catch (e) {
      assignError = e instanceof Error ? e.message : "Failed to assign membership.";
    } finally {
      assignBusy = false;
    }
  }

  async function handleRevokeMembership(membershipId: string) {
    if (!admin || isSelf) return;
    if (!confirm("Revoke this membership?")) return;
    try {
      await revokeMembership(admin.id, membershipId);
      admin = (await refreshAdmin(admin.id)) ?? admin;
    } catch (e) {
      assignError = e instanceof Error ? e.message : "Failed to revoke membership.";
    }
  }

  function orgName(orgId: string): string {
    return data.organizations.find((o: OrganizationSummary) => o.id === orgId)?.name ?? orgId;
  }

  function venueName(venueId: string | null): string {
    if (!venueId) return "(org-level)";
    return data.venues.find((v: VenueSummary) => v.id === venueId)?.name ?? venueId;
  }
</script>

<div class="page">
  <header class="header">
    <div class="header-inner">
      <div>
        <a href="/admins" class="back-link">← Admins</a>
        <h1 class="page-title">{admin?.displayName ?? "Admin not found"}</h1>
      </div>
    </div>
  </header>

  <main class="content">
    {#if !canManageAdmins}
      <div class="card">
        <p class="error">You do not have permission to manage admins.</p>
      </div>
    {:else if !admin}
      <div class="card">
        <p class="error">Admin not found.</p>
        <a href="/admins" class="cancel-link">← Back to admins</a>
      </div>
    {:else}
      <!-- Edit details -->
      <section class="card section">
        <h2 class="section-heading">Details</h2>
        <p class="meta-row"><span class="meta-label">Email</span> <span>{admin.email}</span></p>
        {#if editError}
          <p class="error" role="alert">{editError}</p>
        {/if}
        {#if editSuccess}
          <p class="success" role="status">{editSuccess}</p>
        {/if}
        <form onsubmit={handleEditSubmit}>
          <label>
            Display name
            <input type="text" bind:value={displayName} required disabled={editBusy} autocomplete="off" />
          </label>
          <div class="actions">
            <button type="submit" class="btn-primary" disabled={editBusy}>
              {editBusy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      <!-- Status -->
      {#if !admin.isSuperAdmin}
        <section class="card section">
          <h2 class="section-heading">Status</h2>
          <p class="meta-row">
            Current status:
            <span class="status-badge status-{admin.status}">{admin.status}</span>
          </p>
          {#if statusError}
            <p class="error" role="alert">{statusError}</p>
          {/if}
          {#if isSelf}
            <p class="self-note">You cannot disable your own account.</p>
          {:else}
            <button
              class="btn-danger"
              onclick={handleToggleStatus}
              disabled={statusBusy}
            >
              {statusBusy
                ? "Updating…"
                : admin.status === "active"
                  ? "Disable this admin"
                  : "Enable this admin"}
            </button>
          {/if}
        </section>
      {:else}
        <section class="card section">
          <h2 class="section-heading">Status</h2>
          <p class="meta-row">This is a super-admin. Status cannot be changed here.</p>
        </section>
      {/if}

      <!-- Reset password -->
      <section class="card section">
        <h2 class="section-heading">Reset password</h2>
        {#if resetError}
          <p class="error" role="alert">{resetError}</p>
        {/if}
        {#if resetSuccess}
          <p class="success" role="status">{resetSuccess}</p>
        {/if}
        <form onsubmit={handleResetPassword}>
          <label>
            New password
            <span class="hint">Minimum 8 characters.</span>
            <input type="password" bind:value={newPassword} required minlength="8" disabled={resetBusy} autocomplete="new-password" />
          </label>
          <div class="actions">
            <button type="submit" class="btn-primary" disabled={resetBusy}>
              {resetBusy ? "Resetting…" : "Reset password"}
            </button>
          </div>
        </form>
      </section>

      <!-- Memberships -->
      <section class="card section">
        <h2 class="section-heading">Memberships</h2>
        {#if assignError}
          <p class="error" role="alert">{assignError}</p>
        {/if}
        {#if admin.memberships.length === 0}
          <p class="empty-desc">No memberships assigned.</p>
        {:else}
          {#if isSelf}
            <p class="self-note">You cannot revoke your own membership.</p>
          {/if}
          <div class="membership-list">
            {#each admin.memberships as m (m.id)}
              <div class="membership-row">
                <span class="membership-info">
                  <span class="org-name">{orgName(m.organizationId)}</span>
                  {#if m.venueId}
                    <span class="venue-name"> / {venueName(m.venueId)}</span>
                  {/if}
                  <span class="role-badge">{m.role}</span>
                </span>
                {#if !isSelf}
                  <button class="btn-revoke" onclick={() => handleRevokeMembership(m.id)}>
                    Revoke
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <h3 class="subsection-heading">Assign membership</h3>
        {#if data.organizations.length === 0}
          <p class="empty-desc">No organisations available.</p>
        {:else}
          <form onsubmit={handleAssignMembership}>
            <label>
              Organisation
              <select bind:value={assignOrgId} required disabled={assignBusy}>
                <option value="" disabled>Select an organisation</option>
                {#each data.organizations as org (org.id)}
                  <option value={org.id}>{org.name}</option>
                {/each}
              </select>
            </label>
            <label>
              Venue
              <span class="hint optional">Optional — leave blank for org-level membership</span>
              <select bind:value={assignVenueId} disabled={assignBusy || !assignOrgId}>
                <option value="">— Org-level (no venue) —</option>
                {#each venuesForOrg as venue (venue.id)}
                  <option value={venue.id}>{venue.name}</option>
                {/each}
              </select>
            </label>
            <label>
              Role
              <select bind:value={assignRole} required disabled={assignBusy}>
                {#if data.session?.admin.isSuperAdmin}
                  <option value="org_owner">org_owner</option>
                {/if}
                <option value="venue_manager">venue_manager</option>
                <option value="venue_staff">venue_staff</option>
              </select>
            </label>
            <div class="actions">
              <button type="submit" class="btn-primary" disabled={assignBusy}>
                {assignBusy ? "Assigning…" : "Assign membership"}
              </button>
            </div>
          </form>
        {/if}
      </section>
    {/if}
  </main>
</div>

<style>
  .page { min-height: 100vh; }
  .header {
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 1rem;
  }
  .header-inner { max-width: 720px; margin: 0 auto; }
  .back-link {
    font-size: 0.8125rem; color: var(--color-text-muted); text-decoration: none;
    display: block; margin-bottom: 0.375rem;
  }
  .back-link:hover { color: var(--color-text); text-decoration: underline; }
  .page-title { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
  .content { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
  }
  .section-heading { font-size: 1rem; font-weight: 700; color: var(--color-text); margin-bottom: 1rem; }
  .subsection-heading { font-size: 0.9375rem; font-weight: 600; color: var(--color-text); margin-top: 1.5rem; margin-bottom: 0.75rem; }
  .meta-row { font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
  .meta-label { font-weight: 500; color: var(--color-text-strong); }
  form { display: flex; flex-direction: column; gap: 1rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; color: var(--color-text-strong); }
  .hint { font-size: 0.75rem; font-weight: 400; color: var(--color-text-muted); }
  .hint.optional { font-style: italic; }
  input, select {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    width: 100%;
    font-family: inherit;
  }
  input:focus, select:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
  input:disabled, select:disabled { opacity: 0.6; cursor: not-allowed; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
  .btn-primary {
    background: var(--color-primary); color: var(--color-on-primary); border: none;
    border-radius: var(--radius-sm); padding: 0.625rem 1rem; font-size: 1rem;
    font-weight: 500; cursor: pointer;
  }
  .btn-primary:hover:not(:disabled) { background: var(--color-primary-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-danger {
    background: var(--color-error-bg-soft); color: var(--color-error-text);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-sm); padding: 0.5rem 1rem; font-size: 0.875rem;
    font-weight: 500; cursor: pointer;
  }
  .btn-danger:hover:not(:disabled) { opacity: 0.85; }
  .btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
  .status-badge {
    display: inline-block; padding: 0.125rem 0.5rem; border-radius: var(--radius-pill);
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .status-active { background: var(--color-success-bg-soft, #dcfce7); color: var(--color-success-text, #15803d); }
  .status-disabled { background: var(--color-error-bg-soft); color: var(--color-error-text); }
  .membership-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem; }
  .membership-row {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    background: var(--color-bg); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); padding: 0.625rem 1rem; font-size: 0.875rem;
  }
  .membership-info { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .org-name { font-weight: 600; color: var(--color-text); }
  .venue-name { color: var(--color-text-muted); }
  .role-badge {
    display: inline-block; padding: 0.125rem 0.375rem; border-radius: var(--radius-pill);
    font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    background: var(--color-bg); border: 1px solid var(--color-border-strong);
    color: var(--color-text-muted);
  }
  .btn-revoke {
    background: none; border: none; color: var(--color-error-text);
    font-size: 0.8125rem; cursor: pointer; padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm); flex-shrink: 0;
  }
  .btn-revoke:hover { background: var(--color-error-bg-soft); }
  .empty-desc { font-size: 0.9375rem; color: var(--color-text-muted); line-height: 1.6; }
  .self-note { font-size: 0.875rem; color: var(--color-text-muted); font-style: italic; margin-bottom: 0.5rem; }
  .cancel-link { font-size: 0.875rem; color: var(--color-text-muted); text-decoration: none; }
  .cancel-link:hover { color: var(--color-text); text-decoration: underline; }
  .error {
    background: var(--color-error-bg-soft); border: 1px solid var(--color-error-border);
    border-radius: var(--radius-sm); color: var(--color-error-text);
    font-size: 0.875rem; padding: 0.5rem 0.75rem; margin-bottom: 1rem;
  }
  .success {
    background: var(--color-success-bg-soft, #dcfce7);
    border: 1px solid var(--color-success-border, #86efac);
    border-radius: var(--radius-sm); color: var(--color-success-text, #15803d);
    font-size: 0.875rem; padding: 0.5rem 0.75rem; margin-bottom: 1rem;
  }
</style>
