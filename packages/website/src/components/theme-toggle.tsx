import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "@/hooks/use-theme";
import { useLocale } from "@/i18n/context";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();

  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: t.themeToggle.light, icon: Sun },
    { value: "system", label: t.themeToggle.system, icon: Monitor },
    { value: "dark", label: t.themeToggle.dark, icon: Moon },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t.themeToggle.groupLabel}
      className="inline-flex items-center rounded-md border border-border bg-muted p-0.5"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-[calc(var(--radius)-2px)] transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
