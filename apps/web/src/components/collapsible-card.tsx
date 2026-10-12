"use client";

import { useId } from "react";

/**
 * A card that shows one line (title and a short status) until opened,
 * so optional daily forms don't make the dashboard long. The header is
 * a real button with aria-expanded, and the content stays in the page
 * (hidden) so form state survives closing and reopening.
 */
export function CollapsibleCard({
  id,
  title,
  status,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  status?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const contentId = useId();
  return (
    <div id={id} className="mt-3 scroll-mt-6 rounded border border-border-subtle">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-muted/40"
        >
          <span className="flex flex-col">
            <span className="font-display text-body-l text-foreground">{title}</span>
            {status && <span className="text-sm text-foreground/60">{status}</span>}
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`shrink-0 text-foreground/50 transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
      <div id={contentId} hidden={!open} className="px-5 pb-5">
        {children}
      </div>
    </div>
  );
}
