<script lang="ts">
  import type { BoardEvent } from "$lib/api";

  let { events }: { events: BoardEvent[] } = $props();

  let expanded = $state(false);
</script>

<div class="activity">
  <button class="toggle" type="button" onclick={() => (expanded = !expanded)}>
    <span class="chevron">{expanded ? "▾" : "▸"}</span>
    Recent Activity
    {#if events.length > 0}
      <span class="count">({events.length})</span>
    {/if}
  </button>

  {#if expanded}
    <div class="event-list">
      {#if events.length === 0}
        <p class="empty">No recent activity.</p>
      {:else}
        {#each events as event (event.id)}
          <div class="event">
            <span class="event-message">{event.publicMessage}</span>
            <span class="event-time">{new Date(event.createdAt).toLocaleTimeString()}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .activity {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-strong);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }

  .toggle:hover {
    color: var(--color-text);
  }

  .chevron {
    font-size: 0.75rem;
  }

  .count {
    font-weight: 400;
    color: var(--color-text-muted);
    text-transform: none;
    letter-spacing: 0;
  }

  .event-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty {
    color: var(--color-text-faint);
    font-size: 0.875rem;
    text-align: center;
    padding: 0.5rem 0;
  }

  .event {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: var(--color-text-strong);
    padding: 0.375rem 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .event:last-child {
    border-bottom: none;
  }

  .event-message {
    flex: 1;
    line-height: 1.4;
  }

  .event-time {
    font-size: 0.75rem;
    color: var(--color-text-faint);
    white-space: nowrap;
  }
</style>
