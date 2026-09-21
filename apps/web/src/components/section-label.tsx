/**
 * The web counterpart of the Clinical Brief PDF's section-heading
 * signal dot (see apps/api/src/modules/briefs/brief.pdf.ts's
 * `sectionHeading`) — the same small lilac point, immediately before
 * an uppercase, letter-spaced eyebrow label. Used consistently across
 * the dashboard and Signals so the app and the PDF read as two
 * surfaces of one system, not two different products.
 *
 * Purely a layout/typographic device, same as its PDF counterpart: the
 * dot never varies by what the section contains, so it can't be read
 * as flagging, scoring, or otherwise commenting on the data beneath
 * it.
 */
export function SectionLabel({
  children,
  as: Component = "h2",
}: {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Component className="flex items-center gap-2 text-overline font-medium uppercase tracking-[0.14em] text-muted-foreground">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      {children}
    </Component>
  );
}
