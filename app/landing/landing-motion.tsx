"use client";

import { useEffect, type ReactNode } from "react";

export function LandingMotion({ children }: { children: ReactNode }) {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".landing-page");
    if (!page) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    page.classList.add("landing-motion-ready");
    const revealItems = [...page.querySelectorAll<HTMLElement>(".landing-reveal")];
    const thread = document.querySelector<HTMLElement>(".landing-scroll-thread");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.16, rootMargin: "0px 0px -7% 0px" });
    revealItems.forEach((item) => observer.observe(item));

    let frame = 0;
    const updateProgress = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        document.documentElement.style.setProperty("--sponso-scroll-progress", String(progress));
        thread?.style.setProperty("--sponso-progress-percent", `${progress * 100}%`);
      });
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
      page.classList.remove("landing-motion-ready");
      document.documentElement.style.removeProperty("--sponso-scroll-progress");
    };
  }, []);

  return <>{children}<div className="landing-scroll-thread" aria-hidden="true"><span/><i/></div></>;
}
