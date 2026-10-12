"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// In page order, so the highlighted chip follows the scroll.
const SECTIONS = [
  { id: "how-it-works", key: "howItWorks" },
  { id: "product", key: "product" },
  { id: "brief", key: "brief" },
  { id: "privacy", key: "privacy" },
] as const;

/**
 * Below `lg` the header nav is hidden, which left mobile visitors with
 * one long scroll and no way to jump. This row sticks to the top of the
 * viewport, links to the same sections as the desktop nav, and marks
 * the one you are reading. The page still scrolls continuously.
 */
export function SectionNav() {
  const t = useTranslations("Landing.nav");
  const [active, setActive] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(false);
  const row = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    // A section counts as current while it crosses the middle band of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Narrow phones cannot fit every chip, so keep the current one in view.
  useEffect(() => {
    const ul = row.current;
    const chip = active ? ul?.querySelector<HTMLElement>(`a[href="#${active}"]`) : null;
    if (!ul || !chip) return;
    const left = chip.offsetLeft - ul.offsetLeft;
    if (left < ul.scrollLeft || left + chip.offsetWidth > ul.scrollLeft + ul.clientWidth) {
      ul.scrollTo({ left: left - 16, behavior: "smooth" });
    }
  }, [active]);

  const onScroll = () => {
    const ul = row.current;
    if (ul) setAtEnd(ul.scrollLeft + ul.clientWidth >= ul.scrollWidth - 4);
  };

  return (
    <nav
      aria-label={t("sections")}
      className="sticky top-0 z-30 border-b border-border-subtle bg-background/95 backdrop-blur lg:hidden"
    >
      {/* The fade hints that the row scrolls, and drops once the last chip is in view. */}
      <ul
        ref={row}
        onScroll={onScroll}
        className={`flex gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:gap-2 sm:px-6 ${
          atEnd ? "" : "[mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)]"
        }`}
      >
        {SECTIONS.map(({ id, key }) => {
          const current = active === id;
          return (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                aria-current={current ? "true" : undefined}
                className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full border px-3 text-[13px] sm:px-4 sm:text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  current
                    ? "border-graphite-900 bg-graphite-900 text-pearl-50"
                    : "border-border-subtle text-graphite-700 hover:text-foreground"
                }`}
              >
                {t(key)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
