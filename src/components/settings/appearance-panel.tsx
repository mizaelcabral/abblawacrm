"use client";

import { Check, Moon, SunMoon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { MODES, type Mode } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Appearance panel — light/dark mode selection.
 * The primary accent color is standardized to Violet (Roxo).
 */
export function AppearancePanel() {
  const { mode, setMode } = useTheme();
  return (
    <section className="w-full max-w-full animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Aparência"
        description="Escolha o tema visual do aplicativo (Modo Claro ou Modo Escuro). A alteração é salva neste dispositivo e aplicada em tempo real."
      />

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SunMoon className="size-4 text-muted-foreground" />
          Modo de Visualização
        </h3>

        <div
          role="radiogroup"
          aria-label="Modo de cor"
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {MODES.map((m) => (
            <ModeCard
              key={m}
              mode={m}
              isActive={m === mode}
              onPick={() => setMode(m)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  mode,
  isActive,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  onPick: () => void;
}) {
  const isLight = mode === "light";
  const Icon = isLight ? Sun : Moon;
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={`Usar modo ${isLight ? "claro" : "escuro"}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-semibold capitalize text-foreground">
        {mode === "light" ? "Claro" : "Escuro"}
      </span>
      {isActive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Check className="h-3 w-3" />
          Ativo
        </span>
      )}
    </button>
  );
}
