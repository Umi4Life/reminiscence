<script lang="ts">
  import { onMount } from "svelte";

  type Pref = "system" | "light" | "dark";

  let pref = $state<Pref>("system");

  function resolve(p: Pref): "light" | "dark" {
    if (p === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return p;
  }

  function apply(p: Pref) {
    document.documentElement.setAttribute("data-theme", resolve(p));
  }

  function setPref(p: Pref) {
    pref = p;
    try {
      localStorage.setItem("theme", p);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    apply(p);
  }

  onMount(() => {
    let stored: Pref = "system";
    try {
      const v = localStorage.getItem("theme");
      if (v === "light" || v === "dark" || v === "system") stored = v;
    } catch {
      // ignore
    }
    pref = stored;
    apply(stored);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (pref === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });

  const options: { value: Pref; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
</script>

<div class="theme-toggle" role="group" aria-label="Theme">
  {#each options as opt (opt.value)}
    <button
      type="button"
      class="opt"
      class:active={pref === opt.value}
      aria-pressed={pref === opt.value}
      title={`${opt.label} theme`}
      onclick={() => setPref(opt.value)}
    >
      {#if opt.value === "system"}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M9 20h6M12 16v4" />
        </svg>
      {:else if opt.value === "light"}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      {/if}
      <span class="lbl">{opt.label}</span>
    </button>
  {/each}
</div>

<style>
  .theme-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-md);
  }

  .opt {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px;
    border: none;
    background: none;
    border-radius: var(--radius-pill);
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-muted);
    cursor: pointer;
    line-height: 1;
  }

  .opt:hover {
    color: var(--color-text);
  }

  .opt.active {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .opt svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (max-width: 520px) {
    .lbl {
      display: none;
    }
  }
</style>
