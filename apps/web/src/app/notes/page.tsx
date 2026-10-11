"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { NoteCover, NoteDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

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

function CoverArt({ cover, title }: { cover: NoteCover; title: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative flex aspect-[3/4] w-full items-start justify-center overflow-hidden rounded-r-md rounded-l-sm pt-[18%] shadow-sm ${COVER_FILL[cover]}`}
      style={COVER_TEXTURE}
    >
      <span className="absolute inset-y-0 left-0 w-[9%] bg-foreground/70" />
      <span className="mx-[14%] ml-[18%] w-full rounded-sm bg-pearl-50 px-2 py-1.5 text-center text-xs font-medium leading-snug text-graphite-900 [overflow-wrap:anywhere]">
        {title}
      </span>
    </span>
  );
}

export default function NotesPage() {
  const t = useTranslations("Notes");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading } = useAuth();

  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  // null: the shelf. "new": a blank page. Otherwise the id being edited.
  const [openId, setOpenId] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cover, setCover] = useState<NoteCover>("LILAC");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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

  function open(note: NoteDto | null) {
    setError(null);
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

  async function remove() {
    if (!openId || openId === "new") return;
    if (!window.confirm(t("deleteConfirm"))) return;
    await api.notes.delete(openId);
    setNotes((prev) => prev.filter((n) => n.id !== openId));
    setOpenId(null);
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

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-foreground underline underline-offset-2"
        >
          {t("backToDashboard")}
        </Link>
      </header>
      <p className="mt-2 text-sm text-foreground/60">{t("hint")}</p>

      {openId === null ? (
        <>
          <div className="mt-6">
            <Button type="button" onClick={() => open(null)}>
              {t("newNote")}
            </Button>
          </div>
          {notesLoading ? (
            <p className="mt-8 text-sm text-foreground/50">{tCommon("loading")}</p>
          ) : notes.length === 0 ? (
            <p className="mt-8 text-sm text-foreground/60">{t("empty")}</p>
          ) : (
            <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => open(note)}
                    aria-label={t("openNote", { title: note.title })}
                    className="block w-full rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <CoverArt cover={note.cover} title={note.title} />
                    <span className="mt-2 block truncate text-sm font-medium text-foreground">
                      {note.title}
                    </span>
                    <span className="block text-xs text-foreground/60">
                      {formatDate(note.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <section className="mt-6 flex flex-col gap-4" aria-label={t("editorLabel")}>
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
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="min-h-11 px-2 text-sm font-medium text-foreground underline underline-offset-2"
            >
              {t("backToShelf")}
            </button>
            {openId !== "new" && (
              <button
                type="button"
                onClick={() => void remove()}
                className="ml-auto min-h-11 px-2 text-sm font-medium text-foreground underline decoration-destructive underline-offset-2"
              >
                {t("delete")}
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
