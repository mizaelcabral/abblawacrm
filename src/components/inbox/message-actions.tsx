"use client";

import { useState, type ReactNode } from "react";
import { CornerUpLeft, Copy, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Message } from "@/types";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageActionsProps {
  message: Message;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onDelete?: () => void;
  children: ReactNode;
}

export function MessageActions({
  message,
  onReply,
  onReact,
  onDelete,
  children,
}: MessageActionsProps) {
  const [touchOpen, setTouchOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isAgent =
    message.sender_type === "agent" || message.sender_type === "bot";

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setTouchOpen(true);
  };

  const handleCopy = async () => {
    const text = message.content_text ?? "";
    if (!text) {
      toast.error("Nada para copiar");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado para a área de transferência");
    } catch {
      toast.error("Falha ao copiar");
    }
    setTouchOpen(false);
  };

  const handlePickEmoji = (emoji: string) => {
    onReact(emoji);
    setPickerOpen(false);
    setTouchOpen(false);
  };

  const handleReply = () => {
    onReply();
    setTouchOpen(false);
  };

  const handleConfirmDelete = () => {
    onDelete?.();
    setConfirmDeleteOpen(false);
    setTouchOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          "flex w-full",
          isAgent ? "justify-end" : "justify-start",
        )}
        onContextMenu={handleContextMenu}
        onBlur={() => setTouchOpen(false)}
      >
        <div className="group/actions relative min-w-0 max-w-[75%]">
          {children}
          <div
            data-touch-open={touchOpen || pickerOpen || confirmDeleteOpen ? "true" : undefined}
            className={cn(
              "absolute -top-3 z-10 flex h-7 items-center gap-0.5 rounded-full border border-border bg-popover/95 px-1 shadow-md backdrop-blur-sm transition-opacity",
              "opacity-0 group-hover/actions:opacity-100 group-focus-within/actions:opacity-100",
              "data-[touch-open=true]:opacity-100",
              isAgent ? "right-3" : "left-3",
            )}
          >
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
                aria-label="Reagir"
                title="Reagir"
              >
                <SmilePlus className="h-3.5 w-3.5" />
              </PopoverTrigger>
              <PopoverContent
                className="flex w-auto flex-row gap-1 p-1.5"
                sideOffset={6}
              >
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => handlePickEmoji(e)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-125 hover:bg-muted"
                    aria-label={`Reagir com ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={handleReply}
              className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
              aria-label="Responder"
              title="Responder"
            >
              <CornerUpLeft className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
              aria-label="Copiar"
              title="Copiar"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>

            {onDelete && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                aria-label="Excluir mensagem"
                title="Excluir mensagem"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Message Deletion */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-md bg-background border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground font-bold">Excluir Mensagem</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              Tem certeza de que deseja excluir esta mensagem do histórico? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
