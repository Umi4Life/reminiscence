<script lang="ts">
  // Static informational landing for the public app root. Patrons normally reach
  // a board by scanning an on-site QR code (/q/<accessCode>) or via a board link
  // (/b/<publicSlug>), so this page just explains what the site is.
</script>

<svelte:head>
  <title>Queue Reminiscence</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
  <main class="card">
    <p class="eyebrow">Reminiscence</p>
    <h1 class="title">Join the queue from your phone</h1>
    <p class="body">
      This is the public queue display. To join or leave a queue, scan the QR code shown at the
      venue, it will open your board automatically.
    </p>
    <p class="note">No QR code? Ask the on-site staff for the queue link.</p>
  </main>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .card {
    max-width: 480px;
    width: 100%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 2rem 1.75rem;
    text-align: center;
  }

  .eyebrow {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-brand);
    margin: 0 0 0.75rem;
  }

  .title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 0.75rem;
  }

  .body {
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--color-text-muted);
    margin: 0 0 1rem;
  }

  .note {
    font-size: 0.8125rem;
    color: var(--color-text-faint, var(--color-text-muted));
    margin: 0;
  }
</style>
