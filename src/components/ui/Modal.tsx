"use client";

import React, { useEffect, useId } from "react";
import Card from "@/src/components/ui/Card";
import Button from "@/src/components/ui/Button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number; // px
  closeOnBackdrop?: boolean; // default false (mobile-first)
  closeOnEscape?: boolean; // default false (mobile-first)
  showCloseButton?: boolean; // default true
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 520,
  closeOnBackdrop = false,
  closeOnEscape = false,
  showCloseButton = true,
}: ModalProps) {
  const titleId = useId();

  // 1) Escape (opcional)
  useEffect(() => {
    if (!open || !closeOnEscape) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeOnEscape, onClose]);

  // 2) Bloquear scroll del body mientras está abierto (muy importante en móvil)
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const hasHeader = !!title || showCloseButton;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 60,
        // toque mobile-friendly
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth }}
      >
        <Card>
          {hasHeader && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              {title ? (
                <div id={titleId} style={{ fontWeight: 950, fontSize: 14 }}>
                  {title}
                </div>
              ) : (
                <div />
              )}

              {showCloseButton && (
                <Button
                  variant="secondary"
                  onClick={onClose}
                  style={{ padding: "6px 10px" }}
                >
                  Cerrar
                </Button>
              )}
            </div>
          )}

          {children}
        </Card>
      </div>
    </div>
  );
}