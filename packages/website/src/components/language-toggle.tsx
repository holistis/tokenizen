import { useLocale, type Locale } from "@/i18n/context";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { locale, t, switchLocaleHref } = useLocale();

  const options: Array<{ value: Locale; label: string }> = [
    { value: "nl", label: t.languageSwitch.nl },
    { value: "en", label: t.languageSwitch.en },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t.languageSwitch.groupLabel}
      className="inline-flex items-center rounded-md border border-border bg-muted p-0.5"
    >
      {options.map(({ value, label }) => {
        const active = locale === value;
        const content = (
          <span
            className={cn(
              "inline-flex h-7 items-center justify-center rounded-[calc(var(--radius)-2px)] px-2 font-mono text-[11px] font-medium tracking-wide transition-colors",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </span>
        );

        return active ? (
          <span key={value} role="radio" aria-checked="true">
            {content}
          </span>
        ) : (
          <a key={value} href={switchLocaleHref()} role="radio" aria-checked="false">
            {content}
          </a>
        );
      })}
    </div>
  );
}
