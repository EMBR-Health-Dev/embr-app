import { EMBR_WORDMARK } from "../lib/brand-wordmark";

/**
 * The EMBR wordmark, drawn from the master asset (assets/brand). Takes
 * the text colour of its parent, so it works on light and dark grounds.
 * Size it by height; the width follows.
 */
export function BrandWordmark({ className = "h-4" }: { className?: string }) {
  const { x, y, width, height, path } = EMBR_WORDMARK;
  return (
    <svg
      viewBox={`${x} ${y} ${width} ${height}`}
      role="img"
      aria-label="EMBR"
      className={`w-auto ${className}`}
      fill="currentColor"
    >
      <path d={path} />
    </svg>
  );
}
