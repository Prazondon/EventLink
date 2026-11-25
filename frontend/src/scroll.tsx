/**
 * App-wide scroll behaviour for every page except the landing gallery (which
 * has its own scrollcraft engine):
 *  - reading-progress bar under the header
 *  - reveal-on-scroll for cards, panels and sections (auto-tagged, so pages
 *    do not need markup changes)
 *  - back-to-top button
 *  - scroll to top on route change, skip-to-content link
 * Everything is skipped when the visitor prefers reduced motion (NFR-USE-01).
 */
import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const REVEAL_SELECTOR = [
  ".business-card",
  ".stat-card",
  ".detail-section",
  ".panel-form",
  ".workspace-section",
  ".review-row",
  ".verification-row",
  ".service-row",
  ".contact-card",
  ".page-heading",
  ".search-panel",
  ".empty-state",
].join(",");

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ScrollUI() {
  const { pathname, hash } = useLocation();
  const [showTop, setShowTop] = useState(false);
  const isLanding = pathname === "/";

  // Start each page at the top, unless the link points at an in-page anchor.
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname, hash]);

  // Progress bar + back-to-top, throttled to one update per frame.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
      document.documentElement.toggleAttribute("data-scrolled", window.scrollY > 8);
      setShowTop(window.scrollY > 700);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  // Reveal-on-scroll. New nodes (data loads after render) are picked up by a
  // MutationObserver, so lists that arrive from the API animate in too.
  useEffect(() => {
    if (isLanding || prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    root.classList.add("reveal-on");
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );
    const tag = () => {
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        const siblings = element.parentElement ? Array.from(element.parentElement.children) : [];
        element.style.setProperty("--reveal-i", String(Math.min(siblings.indexOf(element), 6)));
        element.classList.add("reveal");
        io.observe(element);
      });
    };
    tag();
    const mo = new MutationObserver(tag);
    mo.observe(document.getElementById("root") ?? document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
      root.classList.remove("reveal-on");
      document.querySelectorAll(".reveal").forEach((element) => element.classList.remove("reveal", "is-in"));
    };
  }, [pathname, isLanding]);

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={focusMain}>
        Skip to main content
      </a>
      {!isLanding && <div className="scroll-progress" aria-hidden="true" />}
      <button
        type="button"
        className={`back-to-top${showTop ? " is-visible" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" })}
        aria-label="Back to top"
        tabIndex={showTop ? 0 : -1}
      >
        <ArrowUp size={18} />
      </button>
    </>
  );
}

function focusMain(event: React.MouseEvent) {
  const target = document.querySelector<HTMLElement>("main, .page-wrap, .auth-page, .gallery");
  if (!target) return;
  event.preventDefault();
  target.setAttribute("tabindex", "-1");
  target.focus();
  target.scrollIntoView({ behavior: "auto", block: "start" });
}
