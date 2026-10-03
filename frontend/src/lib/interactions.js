// Micro-interactions: ripple, scroll-reveal, tilt, magnetic buttons, topbar shadow.
// Monochrome-safe: no colors injected, CSS classes only. Respects reduced motion.

const RIPPLE_SELECTOR = ".btn, .btn-generate, .nav-link, .tab, .segmented button";
const REVEAL_SELECTOR = ".card, .notice, .page-head, .gen-head, .template-grid > *, .prompt-list > *";
const TILT_SELECTOR = ".prompt-card, .template-grid .card";
const MAGNETIC_SELECTOR = ".btn-primary, .btn-generate";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isCoarsePointer() {
  return typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(pointer: coarse)").matches;
}

function spawnRipple(el, x, y) {
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const s = document.createElement("span");
  s.className = "ripple";
  s.style.width = s.style.height = `${size}px`;
  s.style.left = `${x - rect.left - size / 2}px`;
  s.style.top = `${y - rect.top - size / 2}px`;
  el.appendChild(s);
  setTimeout(() => s.remove(), 600);
}

export function initInteractions() {
  if (typeof document === "undefined") return () => {};
  const cleanups = [];
  const reduced = prefersReducedMotion();
  const coarse = isCoarsePointer();

  // ---- 1. Click ripple (event delegation, works for dynamically added nodes) ----
  const onPointerDown = (e) => {
    if (reduced) return;
    const t = e.target.closest(RIPPLE_SELECTOR);
    if (!t) return;
    const style = getComputedStyle(t);
    if (style.position === "static") t.style.position = "relative";
    if (style.overflow !== "hidden") t.style.overflow = "hidden";
    spawnRipple(t, e.clientX, e.clientY);
  };
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  cleanups.push(() => document.removeEventListener("pointerdown", onPointerDown));

  // ---- 2. Scroll reveal (IntersectionObserver + MutationObserver for new nodes) ----
  let observer = null;
  const seen = new WeakSet();
  function watch(root = document) {
    const nodes = root.querySelectorAll
      ? root.querySelectorAll(REVEAL_SELECTOR)
      : [];
    nodes.forEach((n) => {
      if (seen.has(n) || n.classList.contains("modal") || n.closest(".modal")) return;
      seen.add(n);
      n.classList.add("reveal-on-scroll");
      if (observer) observer.observe(n);
      else n.classList.add("in-view");
    });
  }
  if ("IntersectionObserver" in window && !reduced) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in-view");
            observer.unobserve(en.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
  }
  watch(document);
  const mo = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) watch(n.nodeType === 1 && n.matches(REVEAL_SELECTOR) ? n.parentNode || document : n);
      });
    });
    // Route change: re-anchor reveal for freshly mounted lists
    if (reduced) document.querySelectorAll(".reveal-on-scroll").forEach((n) => n.classList.add("in-view"));
  });
  mo.observe(document.body, { childList: true, subtree: true });
  cleanups.push(() => { if (observer) observer.disconnect(); mo.disconnect(); });

  // ---- 3. Subtle 3D tilt on cards (desktop, fine pointer only) ----
  if (!reduced && !coarse) {
    const onMove = (e) => {
      const card = e.target.closest(TILT_SELECTOR);
      document.querySelectorAll(`${TILT_SELECTOR}.tilting`).forEach((c) => {
        if (c !== card) { c.classList.remove("tilting"); c.style.setProperty("--tilt-x", "0deg"); c.style.setProperty("--tilt-y", "0deg"); }
      });
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.classList.add("tilting");
      card.style.setProperty("--tilt-x", `${(-py * 5).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(px * 6).toFixed(2)}deg`);
    };
    const onLeave = (e) => {
      const card = e.target.closest ? e.target.closest(TILT_SELECTOR) : null;
      if (card) { card.classList.remove("tilting"); card.style.setProperty("--tilt-x", "0deg"); card.style.setProperty("--tilt-y", "0deg"); }
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave, { passive: true });
    cleanups.push(() => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onLeave);
    });

    // ---- 4. Magnetic pull on primary actions ----
    const onMagMove = (e) => {
      const b = e.target.closest(MAGNETIC_SELECTOR);
      document.querySelectorAll(`${MAGNETIC_SELECTOR}.magnetic`).forEach((x) => {
        if (x !== b) x.style.transform = "";
      });
      if (!b || b.disabled) return;
      b.classList.add("magnetic");
      const r = b.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      b.style.transform = `translate(${(dx * 0.06).toFixed(1)}px, ${(dy * 0.08).toFixed(1)}px)`;
    };
    const onMagLeave = (e) => {
      const b = e.target.closest ? e.target.closest(MAGNETIC_SELECTOR) : null;
      if (b) b.style.transform = "";
    };
    document.addEventListener("pointermove", onMagMove, { passive: true });
    document.addEventListener("pointerout", onMagLeave, { passive: true });
    cleanups.push(() => {
      document.removeEventListener("pointermove", onMagMove);
      document.removeEventListener("pointerout", onMagLeave);
    });
  }

  // ---- 5. Topbar shadow on scroll ----
  const topbar = () => document.querySelector(".topbar");
  const onScroll = () => {
    const t = topbar();
    if (t) t.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  cleanups.push(() => window.removeEventListener("scroll", onScroll));

  // ---- 6. Button success flash for copy-style buttons ----
  const onClick = (e) => {
    const b = e.target.closest(".btn");
    if (!b) return;
    if (/copy/i.test(b.textContent || "")) {
      b.classList.remove("flash");
      void b.offsetWidth;
      b.classList.add("flash");
      setTimeout(() => b.classList.remove("flash"), 350);
    }
  };
  document.addEventListener("click", onClick);
  cleanups.push(() => document.removeEventListener("click", onClick));

  return () => cleanups.forEach((fn) => fn());
}
