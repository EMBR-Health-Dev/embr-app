import { useTranslations } from "next-intl";
import {
  BriefIcon,
  CheckCircleIcon,
  DropletIcon,
  HeartPulseIcon,
  IconBadge,
  MoonIcon,
  SparkleIcon,
} from "../little-icons";

// Sample week: which days had a check in, daily context, a cycle entry.
const SAMPLE = [
  [true, true, false],
  [true, false, true],
  [false, true, true],
  [true, true, false],
  [true, false, false],
  [false, false, false],
  [true, true, false],
] as const;

/**
 * A small, illustrative picture of EMBR for the hero: a week of entries
 * drawn with the app's own icons, and a few soft icon bubbles drifting
 * around it. Sample data, labelled as such; decorative for screen
 * readers, which get the caption instead.
 */
export function HeroIllustration() {
  const t = useTranslations("Landing.hero.illustration");
  const days = t("weekdays").split(",");

  return (
    <figure className="relative mx-auto w-full max-w-md">
      <div aria-hidden="true" className="relative">
        <span className="absolute -left-7 top-28 motion-safe:animate-float-soft">
          <IconBadge size="lg" className="bg-background shadow-subtle">
            <HeartPulseIcon size={26} />
          </IconBadge>
        </span>
        <span className="absolute -right-4 -top-5 motion-safe:animate-float-soft [animation-delay:-2s]">
          <IconBadge className="bg-background shadow-subtle">
            <MoonIcon size={22} />
          </IconBadge>
        </span>
        <span className="absolute -bottom-6 right-10 motion-safe:animate-float-soft [animation-delay:-4s]">
          <IconBadge size="lg" className="bg-background shadow-subtle">
            <BriefIcon size={26} />
          </IconBadge>
        </span>
        <span className="absolute -left-2 bottom-4 text-lilac-500 motion-safe:animate-float-soft [animation-delay:-3s]">
          <SparkleIcon size={22} />
        </span>

        <div className="rounded-lg border border-border-subtle bg-surface p-5 shadow-subtle">
          <div className="flex items-baseline justify-between">
            <p className="font-display text-heading-m text-foreground">{t("title")}</p>
            <p className="text-caption text-muted-foreground">{t("count")}</p>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {SAMPLE.map(([felt, context, cycle], i) => (
              <div
                key={i}
                className={`flex flex-col items-center gap-1 rounded-md py-2 ${
                  i === SAMPLE.length - 1 ? "bg-lilac-100 ring-1 ring-lilac-300" : ""
                }`}
              >
                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                  {days[i]}
                </span>
                <HeartPulseIcon
                  size={17}
                  className={felt ? "text-lilac-700" : "text-foreground/15"}
                />
                <MoonIcon size={17} className={context ? "text-lilac-700" : "text-foreground/15"} />
                <DropletIcon
                  size={17}
                  className={cycle ? "text-lilac-700" : "text-foreground/15"}
                />
              </div>
            ))}
          </div>
          <ul className="mt-4 flex flex-col gap-2 text-body-s">
            <li className="flex items-center gap-2 text-foreground/50 line-through">
              <CheckCircleIcon size={18} className="text-lilac-700" />
              {t("stepCheckIn")}
            </li>
            <li className="flex items-center gap-2 text-foreground">
              <CheckCircleIcon size={18} className="text-foreground/25" />
              {t("stepContext")}
            </li>
          </ul>
        </div>
      </div>
      <figcaption className="mt-8 text-center text-caption text-muted-foreground">
        {t("caption")}
      </figcaption>
    </figure>
  );
}
