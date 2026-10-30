"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SeverityLevel, SymptomCategory } from "@embr/types";
import { BrandWordmark } from "../../components/brand-wordmark";
import { Button } from "../../components/button";
import { LanguageSwitcher } from "../../components/language-switcher";
import { SafetyNotice } from "../../components/safety-notice";
import { SeverityMark } from "../../components/severity-mark";
import { richText } from "../../lib/rich-text";
import { SaveBaseline, useLongDate } from "./save-baseline";
import {
  buildResult,
  clearAnswers,
  emptyAnswers,
  FIRST_CHECK_IN_CATEGORIES,
  FREQUENCIES,
  GOALS,
  loadAnswers,
  saveAnswers,
  SLEEP_OPTIONS,
  STEPS,
  WORK_OPTIONS,
  type FirstCheckInAnswers,
  type Frequency,
  type Goal,
  type Step,
  type SymptomAnswer,
} from "../../lib/first-check-in";

const SEVERITIES: SeverityLevel[] = ["MILD", "MODERATE", "SEVERE"];

const GOAL_KEYS: Record<Goal, string> = {
  UNDERSTAND_EXPERIENCE: "understandExperience",
  UNDERSTAND_PATTERNS: "understandPatterns",
  PREPARE_FOR_APPOINTMENT: "prepareForAppointment",
  KEEP_RECORD: "keepRecord",
  NOT_SURE: "notSure",
};

const AREA_KEYS = {
  SLEEP: "sleep",
  ENERGY: "energy",
  MOOD: "mood",
  BODY: "body",
  FOCUS: "focus",
} as const;

const choice =
  "flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border px-4 py-3 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
// Three across on a phone: the bars sit above the word so "Moderate"
// fits at 320px wide.
const severityChoice =
  "flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-sm border px-2 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const chosen = "border-foreground bg-muted text-foreground";
const unchosen =
  "border-border-subtle text-foreground/80 hover:border-border hover:text-foreground";

/**
 * The account free first check in: five screens and a result, all on
 * this device. Answers are kept in this tab's session storage after
 * every change, so a reload does not lose them, and nothing here sends
 * them anywhere. The only network request this page can make is the
 * signed in check every page makes, which carries no answers.
 */
export function FirstCheckIn() {
  const t = useTranslations("FirstCheckIn");
  const [answers, setAnswers] = useState<FirstCheckInAnswers>(emptyAnswers);
  const [restored, setRestored] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [savedOn, setSavedOn] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Session storage only exists in the browser, so the restore waits for
  // mount rather than running during the server render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers(loadAnswers());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveAnswers(answers);
  }, [answers, restored]);

  // Each screen change moves focus to its heading, so a screen reader
  // announces the new question instead of staying on the old button.
  useEffect(() => {
    if (restored) headingRef.current?.focus();
  }, [answers.step, restored]);

  function update(patch: Partial<FirstCheckInAnswers>) {
    setCleared(false);
    setAnswers((prev) => ({ ...prev, ...patch }));
  }

  function go(step: Step) {
    update({ step });
    window.scrollTo(0, 0);
  }

  // Called only once the server has confirmed her baseline exists; until
  // then the answers stay in the tab.
  function saved(completedOn: string) {
    clearAnswers();
    setAnswers(emptyAnswers());
    setSavedOn(completedOn);
  }

  function clearAll() {
    clearAnswers();
    setAnswers(emptyAnswers());
    setCleared(true);
  }

  const index = STEPS.indexOf(answers.step);
  const heading = (text: string) => (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="font-display text-heading-xl text-foreground focus:outline-none"
    >
      {text}
    </h1>
  );

  return (
    <main className="flex min-h-screen flex-col bg-background px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <BrandWordmark className="h-[15px]" />
          </Link>
          <LanguageSwitcher />
        </div>
        {!savedOn && answers.step !== "result" && (
          <p className="mt-6 text-caption text-foreground/60">
            {t("progress", { current: index + 1, total: STEPS.length - 1 })}
          </p>
        )}

        {cleared && (
          <p role="status" className="mt-6 rounded-sm border border-border-subtle p-3 text-sm">
            {t("result.cleared")}
          </p>
        )}

        <div className="flex flex-1 flex-col py-8">
          {savedOn && <Saved heading={heading} completedOn={savedOn} />}
          {!savedOn && answers.step === "promise" && (
            <Promise heading={heading} onPick={(goal) => update({ goal, step: "symptoms" })} />
          )}
          {!savedOn && answers.step === "symptoms" && (
            <Symptoms
              heading={heading}
              symptoms={answers.symptoms}
              onChange={(symptoms) => update({ symptoms })}
              onBack={() => go("promise")}
              onNext={() => go(answers.symptoms.length > 0 ? "details" : "context")}
            />
          )}
          {!savedOn && answers.step === "details" && (
            <Details
              heading={heading}
              symptoms={answers.symptoms}
              onChange={(symptoms) => update({ symptoms })}
              onBack={() => go("symptoms")}
              onNext={() => go("context")}
            />
          )}
          {!savedOn && answers.step === "context" && (
            <Context
              heading={heading}
              answers={answers}
              onChange={update}
              onBack={() => go(answers.symptoms.length > 0 ? "details" : "symptoms")}
              onNext={() => go("result")}
            />
          )}
          {!savedOn && answers.step === "result" && (
            <Result
              heading={heading}
              answers={answers}
              onEdit={() => go("symptoms")}
              onClear={clearAll}
              onSaved={saved}
            />
          )}
        </div>
      </div>
    </main>
  );
}

type Heading = (text: string) => React.ReactNode;

function Saved({ heading, completedOn }: { heading: Heading; completedOn: string }) {
  const t = useTranslations("FirstCheckIn.save");
  const longDate = useLongDate();
  return (
    <>
      {heading(t("savedTitle"))}
      <p role="status" className="mt-4 text-sm text-foreground/80">
        {t("savedBody", { date: longDate(completedOn) })}
      </p>
      <Link
        href="/dashboard"
        className="mt-8 inline-flex min-h-11 items-center justify-center rounded-sm bg-foreground px-5 text-sm font-medium text-background hover:bg-graphite-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("goToDashboard")}
      </Link>
    </>
  );
}

function NavRow({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const t = useTranslations("FirstCheckIn");
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <Button variant="ghost" onClick={onBack} className="min-h-11">
        {t("back")}
      </Button>
      <Button onClick={onNext} className="min-h-11">
        {nextLabel}
      </Button>
    </div>
  );
}

function Promise({ heading, onPick }: { heading: Heading; onPick: (goal: Goal) => void }) {
  const t = useTranslations("FirstCheckIn.promise");
  const tGoal = useTranslations("Onboarding.jobToBeDone");
  return (
    <>
      {heading(t("headline"))}
      <p className="mt-4 text-sm text-foreground/80">{t("privacy")}</p>
      <p className="mt-2 text-sm text-foreground/60">{t("notDiagnosis")}</p>
      <h2 className="mt-8 text-body-m font-medium text-foreground">{t("question")}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {GOALS.map((goal) => (
          <button
            key={goal}
            type="button"
            onClick={() => onPick(goal)}
            className={`${choice} ${unchosen}`}
          >
            {tGoal(GOAL_KEYS[goal])}
          </button>
        ))}
      </div>
    </>
  );
}

function Symptoms({
  heading,
  symptoms,
  onChange,
  onBack,
  onNext,
}: {
  heading: Heading;
  symptoms: SymptomAnswer[];
  onChange: (symptoms: SymptomAnswer[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("FirstCheckIn");
  const tEnum = useTranslations("Enums");
  const picked = new Set(symptoms.map((s) => s.category));

  function toggle(category: SymptomCategory) {
    onChange(
      picked.has(category)
        ? symptoms.filter((s) => s.category !== category)
        : [...symptoms, { category, severity: null, frequency: null }],
    );
  }

  return (
    <>
      {heading(t("symptoms.headline"))}
      <p className="mt-3 text-sm text-foreground/60">{t("symptoms.hint")}</p>
      <fieldset className="mt-6">
        <legend className="sr-only">{t("symptoms.headline")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FIRST_CHECK_IN_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={picked.has(category)}
              onClick={() => toggle(category)}
              className={`${choice} ${picked.has(category) ? chosen : unchosen}`}
            >
              <span>{tEnum(`category.${category}`)}</span>
              <span aria-hidden="true" className="text-caption">
                {picked.has(category) ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <NavRow
        onBack={onBack}
        onNext={onNext}
        nextLabel={symptoms.length > 0 ? t("continue") : t("skip")}
      />
    </>
  );
}

function Details({
  heading,
  symptoms,
  onChange,
  onBack,
  onNext,
}: {
  heading: Heading;
  symptoms: SymptomAnswer[];
  onChange: (symptoms: SymptomAnswer[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("FirstCheckIn");
  const tEnum = useTranslations("Enums");
  const tCheckIn = useTranslations("CheckIn");

  function set(category: SymptomCategory, patch: Partial<SymptomAnswer>) {
    onChange(symptoms.map((s) => (s.category === category ? { ...s, ...patch } : s)));
  }

  return (
    <>
      {heading(t("details.headline"))}
      <p className="mt-3 text-sm text-foreground/60">
        {tCheckIn.rich("severityGuide", richText)} {t("details.optional")}
      </p>
      <div className="mt-6 flex flex-col gap-6">
        {symptoms.map((s) => {
          const name = tEnum(`category.${s.category}`);
          return (
            <section
              key={s.category}
              aria-label={name}
              className="rounded-sm border border-border-subtle p-4"
            >
              <h2 className="text-body-m font-medium text-foreground">{name}</h2>
              <fieldset className="mt-3">
                <legend className="text-caption text-foreground/70">{t("details.strength")}</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {SEVERITIES.map((severity) => (
                    <button
                      key={severity}
                      type="button"
                      aria-pressed={s.severity === severity}
                      aria-label={`${name}: ${tEnum(`severity.${severity}`)}`}
                      onClick={() =>
                        set(s.category, { severity: s.severity === severity ? null : severity })
                      }
                      className={`${severityChoice} ${s.severity === severity ? chosen : unchosen}`}
                    >
                      <SeverityMark severity={severity} />
                      <span>{tEnum(`severity.${severity}`)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-4">
                <legend className="text-caption text-foreground/70">{t("details.often")}</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {FREQUENCIES.map((frequency) => (
                    <button
                      key={frequency}
                      type="button"
                      aria-pressed={s.frequency === frequency}
                      aria-label={`${name}: ${t(`frequency.${frequency}`)}`}
                      onClick={() =>
                        set(s.category, {
                          frequency: s.frequency === frequency ? null : frequency,
                        })
                      }
                      className={`${choice} ${s.frequency === frequency ? chosen : unchosen}`}
                    >
                      {t(`frequency.${frequency}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
          );
        })}
      </div>
      <NavRow onBack={onBack} onNext={onNext} nextLabel={t("continue")} />
    </>
  );
}

function Context({
  heading,
  answers,
  onChange,
  onBack,
  onNext,
}: {
  heading: Heading;
  answers: FirstCheckInAnswers;
  onChange: (patch: Partial<FirstCheckInAnswers>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("FirstCheckIn");
  const tEnum = useTranslations("Enums");
  const answered = answers.sleep !== null || answers.work !== null;
  return (
    <>
      {heading(t("context.headline"))}
      <p className="mt-3 text-sm text-foreground/60">{t("context.hint")}</p>
      <fieldset className="mt-6">
        <legend className="text-body-m font-medium text-foreground">{t("context.sleep")}</legend>
        <div className="mt-3 flex flex-col gap-2">
          {SLEEP_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={answers.sleep === value}
              onClick={() => onChange({ sleep: answers.sleep === value ? null : value })}
              className={`${choice} ${answers.sleep === value ? chosen : unchosen}`}
            >
              {tEnum(`sleepDuration.${value}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-body-m font-medium text-foreground">{t("context.work")}</legend>
        <div className="mt-3 flex flex-col gap-2">
          {WORK_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={answers.work === value}
              onClick={() => onChange({ work: answers.work === value ? null : value })}
              className={`${choice} ${answers.work === value ? chosen : unchosen}`}
            >
              {tEnum(`workImpact.${value}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <NavRow
        onBack={onBack}
        onNext={onNext}
        nextLabel={answered ? t("seeResult") : t("skipToResult")}
      />
    </>
  );
}

function Result({
  heading,
  answers,
  onEdit,
  onClear,
  onSaved,
}: {
  heading: Heading;
  answers: FirstCheckInAnswers;
  onEdit: () => void;
  onClear: () => void;
  onSaved: (completedOn: string) => void;
}) {
  const t = useTranslations("FirstCheckIn");
  const tEnum = useTranslations("Enums");
  const tArea = useTranslations("Onboarding.whatsGoingOn");
  const locale = useLocale();
  const result = buildResult(answers);

  // Names read mid sentence in the clinician questions; Japanese has no case.
  const inSentence = (category: SymptomCategory) => {
    const name = tEnum(`category.${category}`);
    return locale === "ja" ? name : name.toLocaleLowerCase(locale);
  };
  const often = (frequency: Frequency | null) =>
    frequency ? t(`frequency.${frequency}`) : t("result.notGiven");

  function question(kind: (typeof result.questions)[number]) {
    const lead = result.leading;
    if (kind === "main" && lead) {
      return lead.frequency
        ? t("questions.main", {
            symptom: inSentence(lead.category),
            often: t(`frequencyInSentence.${lead.frequency}`),
          })
        : t("questions.mainNoOften", { symptom: inSentence(lead.category) });
    }
    if (kind === "together") {
      const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
      return t("questions.together", {
        symptoms: list.format(result.ranked.map((s) => inSentence(s.category))),
      });
    }
    return t(`questions.${kind}`);
  }

  return (
    <>
      {heading(t("result.headline"))}
      <p className="mt-3 text-sm text-foreground/70">
        {answers.symptoms.length > 0 ? t("result.intro") : t("result.none")}
      </p>

      {result.groups.map((group) => (
        <section key={group.area} className="mt-6" aria-labelledby={`area-${group.area}`}>
          <h2
            id={`area-${group.area}`}
            className="text-caption font-medium uppercase tracking-wide text-foreground/60"
          >
            {tArea(AREA_KEYS[group.area])}
          </h2>
          <ul className="mt-2 divide-y divide-border-subtle rounded-sm border border-border-subtle">
            {group.symptoms.map((s) => (
              <li key={s.category} className="flex items-start gap-3 px-4 py-3">
                <span className="pt-1 text-foreground">
                  {s.severity ? (
                    <SeverityMark severity={s.severity} />
                  ) : (
                    <span className="inline-block w-[13px]" />
                  )}
                </span>
                <span>
                  <span className="block text-body-m text-foreground">
                    {tEnum(`category.${s.category}`)}
                  </span>
                  <span className="block text-sm text-foreground/70">
                    {t("result.atWorst", {
                      severity: s.severity ? tEnum(`severity.${s.severity}`) : t("result.notGiven"),
                    })}
                    {" · "}
                    {t("result.howOften", { often: often(s.frequency) })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {(answers.sleep || answers.work) && (
        <section className="mt-6" aria-labelledby="area-context">
          <h2
            id="area-context"
            className="text-caption font-medium uppercase tracking-wide text-foreground/60"
          >
            {t("context.headline")}
          </h2>
          <ul className="mt-2 divide-y divide-border-subtle rounded-sm border border-border-subtle text-sm text-foreground">
            {answers.sleep && (
              <li className="px-4 py-3">
                {t("result.sleep", { value: tEnum(`sleepDuration.${answers.sleep}`) })}
              </li>
            )}
            {answers.work && (
              <li className="px-4 py-3">
                {t("result.work", { value: tEnum(`workImpact.${answers.work}`) })}
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="mt-8 border-l-2 border-lilac-300 pl-3" aria-labelledby="limits">
        <h2 id="limits" className="text-body-m font-medium text-foreground">
          {t("result.limitsTitle")}
        </h2>
        <p className="mt-1 text-sm text-foreground/70">{t("result.limitsBody")}</p>
      </section>

      <section className="mt-8" aria-labelledby="next-step">
        <h2 id="next-step" className="text-body-m font-medium text-foreground">
          {t("result.nextTitle")}
        </h2>
        <p className="mt-1 text-sm text-foreground/80">{t(`result.next.${result.nextStep}`)}</p>
      </section>

      <section className="mt-8" aria-labelledby="questions">
        <h2 id="questions" className="text-body-m font-medium text-foreground">
          {t("result.questionsTitle")}
        </h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-foreground/80">
          {result.questions.map((kind) => (
            <li key={kind}>{question(kind)}</li>
          ))}
        </ol>
      </section>

      <section className="mt-10 flex flex-col gap-3 print:hidden" aria-labelledby="what-next">
        <h2 id="what-next" className="text-body-m font-medium text-foreground">
          {t("result.exitsTitle")}
        </h2>
        <SaveBaseline answers={answers} onSaved={onSaved} />
        <Button variant="ghost" className="min-h-11" onClick={() => window.print()}>
          {t("result.print")}
        </Button>
        <Button variant="ghost" className="min-h-11" onClick={onEdit}>
          {t("result.edit")}
        </Button>
        <Button variant="ghost" className="min-h-11" onClick={onClear}>
          {t("result.clear")}
        </Button>
        <p className="text-caption text-foreground/60">{t("result.clearNote")}</p>
      </section>

      <SafetyNotice />
    </>
  );
}
