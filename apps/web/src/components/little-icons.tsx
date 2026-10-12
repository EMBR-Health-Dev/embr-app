/**
 * A small set of soft, rounded line icons drawn for EMBR: 24 unit
 * viewBox, 1.75 stroke, round caps and joins, currentColor. Decorative
 * by default (aria-hidden); give them meaning with nearby text.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** How she feels: a small heart with a pulse line through it. */
export function HeartPulseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z" />
      <path d="M7.5 12h2l1.25-2 2 4 1.25-2h2.5" />
    </Icon>
  );
}

/** Daily context: a crescent moon with a tiny star. */
export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />
      <path d="M17 4.5v2M16 5.5h2" />
    </Icon>
  );
}

/** Cycle or bleeding: a soft droplet. */
export function DropletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
    </Icon>
  );
}

/** The BRIEF: a page with a folded corner and two lines. */
export function BriefIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4M9 12.5h6M9 16h4" />
    </Icon>
  );
}

/** Treatments: a small rounded capsule. */
export function CapsuleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" />
      <path d="m10 9.2 4 5.6" />
    </Icon>
  );
}

/** Patterns: three bars rising, with a dot above. */
export function PatternIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 19v-4M12 19v-7M18 19V9" />
      <circle cx="18" cy="5" r="1" />
    </Icon>
  );
}

/** Privacy: a rounded lock with a keyhole. */
export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="3" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2" />
    </Icon>
  );
}

/** A little sparkle, for small moments of encouragement. */
export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z" />
      <path d="M19 16.5v3M17.5 18h3" />
    </Icon>
  );
}

/** A soft check inside a circle. */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.25 2.25 2.25 4.75-4.75" />
    </Icon>
  );
}

/** An empty circle, for a step not done yet. */
export function CircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
    </Icon>
  );
}
