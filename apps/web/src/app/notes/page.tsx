"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { NoteCover, NoteDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { AppNav } from "../../components/app-nav";

const COVERS: NoteCover[] = ["LILAC", "PLUM", "PEARL", "ICE", "ROSE"];

// Notebook covers in the EMBR palette. The text on each cover sits on a
// pearl label, so it reads the same on every cover and in both themes.
const COVER_FILL: Record<NoteCover, string> = {
  LILAC: "bg-lilac-300",
  PLUM: "bg-lilac-700",
  PEARL: "bg-graphite-100",
  ICE: "bg-ice-500",
  ROSE: "bg-rose-500",
};
const COVER_TEXTURE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.14) 0 6px, transparent 6px 14px)",
};

/** The cover at list size: colour, texture and spine, no label. */
function CoverSwatch({ cover }: { cover: NoteCover }) {
  return (
    <span
      aria-hidden="true"
      className={`relative block h-14 w-10 shrink-0 overflow-hidden rounded-r-sm rounded-l-[2px] shadow-sm ${COVER_FILL[cover]}`}
      style={COVER_TEXTURE}
    >
      <span className="absolute inset-y-0 left-0 w-[14%] bg-foreground/70" />
    </span>
  );
}

/** The opening of a note, on one line, for the list. */
function preview(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export default function NotesPage() {
  const t = useTranslations("Notes");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [managesOrg, setManagesOrg] = useState(false);

  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  // null: the shelf. "new": a blank page. Otherwise the id being edited.
  const [openId, setOpenId] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cover, setCover] = useState<NoteCover>("LILAC");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Inline confirmations instead of the browser's own dialog.
  const [confirming, setConfirming] = useState<"discard" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Same Organization-link reasoning as trends/page.tsx.
  useEffect(() => {
    if (!user) return;
    api.organizations
      .mine()
      .then((rows) => setManagesOrg(rows.some((m) => m.role === "ORG_ADMIN")))
      .catch(() => setManagesOrg(false));
  }, [user]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  // Keyed on the id, not the user object, so a re-render that hands back
  // a new object for the same person never reloads over unsaved changes.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    api.notes
      .list({ pageSize: 100 })
      .then((page) => setNotes(page.items))
      .finally(() => setNotesLoading(false));
  }, [userId]);

  const openNote = openId && openId !== "new" ? notes.find((n) => n.id === openId) : undefined;
  // Unsaved when the page differs from what was opened.
  const dirty =
    openId !== null &&
    (title !== (openNote?.title ?? "") ||
      body !== (openNote?.body ?? "") ||
      cover !== (openNote?.cover ?? "LILAC"));

  function open(note: NoteDto | null) {
    setError(null);
    setConfirming(null);
    setOpenId(note ? note.id : "new");
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setCover(note?.cover ?? "LILAC");
  }

  async function save() {
    if (!title.trim()) {
      setError(t("titleRequired"));
      return;
    }
    setSaving(true);
    try {
      if (openId === "new") {
        const created = await api.notes.create({ title, body, cover });
        setNotes((prev) => [created, ...prev]);
      } else if (openId) {
        const updated = await api.notes.update(openId, { title, body, cover });
        setNotes((prev) => [updated, ...prev.filter((n) => n.id !== updated.id)]);
      }
      setOpenId(null);
    } catch {
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Leaving with unsaved text asks first, so nothing is lost by a stray tap.
  function close() {
    if (dirty && confirming !== "discard") {
      setConfirming("discard");
      return;
    }
    setConfirming(null);
    setOpenId(null);
  }

  async function remove() {
    if (!openId || openId === "new") return;
    setDeleting(true);
    setError(null);
    try {
      await api.notes.delete(openId);
      setNotes((prev) => prev.filter((n) => n.id !== openId));
      setConfirming(null);
      setOpenId(null);
    } catch {
      setError(t("deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-foreground/50">{tCommon("loading")}</p>
      </main>
    );
  }

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(iso),
    );
  const monthOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(iso));

  // Most recently edited first, grouped by the month of that edit.
  const q = query.trim().toLocaleLowerCase(locale);
  const shown = [...notes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter(
      (n) =>
        !q ||
        n.title.toLocaleLowerCase(locale).includes(q) ||
        n.body.toLocaleLowerCase(locale).includes(q),
    );
  const groups: { month: string; notes: NoteDto[] }[] = [];
  for (const note of shown) {
    const month = monthOf(note.updatedAt);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.notes.push(note);
    else groups.push({ month, notes: [note] });
  }

  return (
    <div className="min-h-screen">
      <AppNav userEmail={user.email} managesOrg={managesOrg} onLogout={() => void handleLogout()} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>
        <p className="mt-3 max-w-prose text-body-s text-foreground/60">{t("hint")}</p>

        {openId === null ? (
          <>
            <div className="mt-6 flex flex-wrap items-end gap-4">
              <Button type="button" onClick={() => open(null)}>
                {t("newNote")}
              </Button>
              {notes.length > 3 && (
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <Field
                    label={t("searchLabel")}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}
            </div>
            {notesLoading ? (
              <p className="mt-8 text-body-s text-foreground/50">{tCommon("loading")}</p>
            ) : notes.length === 0 ? (
              <p className="mt-8 max-w-prose text-body-s text-foreground/70">{t("empty")}</p>
            ) : shown.length === 0 ? (
              <p className="mt-8 text-body-s text-foreground/70">{t("noMatches", { query })}</p>
            ) : (
              <div className="mt-8 flex flex-col gap-8">
                {groups.map((group, groupIndex) => (
                  <section key={group.month} aria-labelledby={`notes-month-${groupIndex}`}>
                    <h2
                      id={`notes-month-${groupIndex}`}
                      className="sticky top-0 z-10 bg-background/95 py-1 font-sans text-caption font-medium uppercase tracking-wide text-foreground/60"
                    >
                      {group.month}
                    </h2>
                    <ul className="mt-2 divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface">
                      {group.notes.map((note) => (
                        <li key={note.id}>
                          <button
                            type="button"
                            onClick={() => open(note)}
                            aria-label={t("openNote", { title: note.title })}
                            className="flex w-full items-start gap-4 px-4 py-4 text-left hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                          >
                            <CoverSwatch cover={note.cover} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-foreground [overflow-wrap:anywhere]">
                                {note.title}
                              </span>
                              <span className="block text-caption text-foreground/60">
                                {formatDate(note.updatedAt)}
                              </span>
                              <span className="mt-1 line-clamp-2 text-body-s text-foreground/70">
                                {preview(note.body) || (
                                  <span className="italic text-foreground/50">{t("noText")}</span>
                                )}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : (
          <section className="mt-6 flex flex-col gap-4" aria-label={t("editorLabel")}>
            {openNote && (
              <p className="text-caption text-foreground/60">
                {t("dates", {
                  created: formatDate(openNote.createdAt),
                  updated: formatDate(openNote.updatedAt),
                })}
              </p>
            )}
            <Field
              label={t("titleLabel")}
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
            <fieldset>
              <legend className="text-sm font-medium text-foreground">{t("coverLabel")}</legend>
              <div role="radiogroup" className="mt-2 flex flex-wrap gap-3">
                {COVERS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={cover === c}
                    aria-label={t(`cover.${c}`)}
                    onClick={() => setCover(c)}
                    className={`h-11 w-11 rounded-sm border ${COVER_FILL[c]} ${
                      cover === c
                        ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                        : "border-border"
                    }`}
                    style={COVER_TEXTURE}
                  />
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">{t("bodyLabel")}</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={20000}
                rows={14}
                className="rounded-sm border border-border bg-background px-3 py-2 leading-relaxed text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(transparent 0 calc(1.625em - 1px), rgb(var(--border-subtle)) calc(1.625em - 1px) 1.625em)",
                  backgroundPositionY: "0.5rem",
                }}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm font-medium text-foreground">
                {error}
              </p>
            )}

            {confirming === "discard" && (
              <div
                role="group"
                aria-label={t("discardConfirm")}
                className="rounded-md border border-border-subtle bg-surface p-4 text-body-s"
              >
                <p className="text-foreground">{t("discardConfirm")}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button type="button" onClick={close}>
                    {t("discard")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                    {t("keepEditing")}
                  </Button>
                </div>
              </div>
            )}
            {confirming === "delete" && (
              <div
                role="group"
                aria-label={t("deleteConfirm")}
                className="rounded-md border border-border-subtle bg-surface p-4 text-body-s"
              >
                <p className="text-foreground">{t("deleteConfirm")}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button type="button" onClick={() => void remove()} disabled={deleting}>
                    {t("delete")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            )}

            {confirming === null && (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => void save()} disabled={saving}>
                  {saving ? t("saving") : t("save")}
                </Button>
                <button
                  type="button"
                  onClick={close}
                  className="min-h-11 px-2 text-sm font-medium text-foreground underline underline-offset-2"
                >
                  {t("backToShelf")}
                </button>
                {openId !== "new" && (
                  <button
                    type="button"
                    onClick={() => setConfirming("delete")}
                    className="ml-auto min-h-11 px-2 text-sm font-medium text-foreground underline decoration-destructive underline-offset-2"
                  >
                    {t("delete")}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
