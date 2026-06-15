<script lang="ts">
  import type { PublicBoardEvent } from "$lib/api";

  let { events }: { events: PublicBoardEvent[] } = $props();

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }
</script>

<section class="section">
  <h2 class="section-title">Recent Activity</h2>
  {#if events.length === 0}
    <p class="empty">No recent activity.</p>
  {:else}
    <ol class="event-list">
      {#each events as event (event.id)}
        <li class="event-item">
          <span class="event-msg">{event.publicMessage}</span>
          <span class="event-time">{formatTime(event.createdAt)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  /* .section and .section-title come from @queue-reminiscence/ui/components.css. */
  .empty {
    font-size: 0.875rem;
    color: var(--color-text-faint);
  }

  .event-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    list-style: none;
  }

  .event-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  .event-msg {
    color: var(--color-text-strong);
    flex: 1;
  }

  .event-time {
    color: var(--color-text-faint);
    white-space: nowrap;
    font-size: 0.8125rem;
  }
</style>
