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

/** A calendar page with two rings and a marked day. */
export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path d="M8.5 3.5v3.5M15.5 3.5v3.5M4 10h16" />
      <circle cx="12" cy="15" r="1.25" />
    </Icon>
  );
}

/** Two speech bubbles: the conversation with a clinician. */
export function ConversationIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v4a2.5 2.5 0 0 1-2.5 2.5H9l-3 2.5V13h0A2 2 0 0 1 4 11V6.5Z" />
      <path d="M18.5 9.5a1.5 1.5 0 0 1 1.5 1.5v4.5a2 2 0 0 1-2 2v2l-2.5-2H12a2 2 0 0 1-2-1.5" />
    </Icon>
  );
}

/** An even, steady line: the same scale every time. */
export function SteadyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h16M4 12h16M4 16h16" />
      <circle cx="9" cy="8" r="1.25" />
      <circle cx="15" cy="12" r="1.25" />
      <circle cx="11" cy="16" r="1.25" />
    </Icon>
  );
}

/** A pencil writing a short line: describing, not deciding. */
export function NoteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 19.5h7" />
      <path d="m14.5 5.5 4 4L10 18l-4.5.5L6 14l8.5-8.5Z" />
    </Icon>
  );
}

/** An arrow into a tray: take your record with you. */
export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v10M8 10.5l4 4 4-4" />
      <path d="M5 16v1.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V16" />
    </Icon>
  );
}

/** A soft bin: delete your account. */
export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 11a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8l.8-11M10.5 11v5M13.5 11v5" />
    </Icon>
  );
}

/** A phone and a laptop: where you're signed in. */
export function DevicesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="12" height="9" rx="1.5" />
      <path d="M2.5 17h11" />
      <rect x="15.5" y="9" width="5.5" height="10" rx="1.5" />
      <path d="M18 17h.5" />
    </Icon>
  );
}

/** Three heads together: a group, never one person. */
export function GroupIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="2.75" />
      <circle cx="5.75" cy="10" r="2" />
      <circle cx="18.25" cy="10" r="2" />
      <path d="M7 19a5 5 0 0 1 10 0M2.5 18a3.5 3.5 0 0 1 4.5-3.3M21.5 18a3.5 3.5 0 0 0-4.5-3.3" />
    </Icon>
  );
}

/**
 * An icon in a soft lilac circle, the way the homepage and dashboard
 * show them. Purely decorative.
 */
export function IconBadge({
  children,
  size = "md",
  className = "",
}: {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-lilac-100 text-lilac-700 ring-1 ring-lilac-200 ${box} ${className}`}
    >
      {children}
    </span>
  );
}
