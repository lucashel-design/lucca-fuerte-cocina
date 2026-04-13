"use client";

import React, { useEffect } from "react";
import Card from "@/src/components/ui/Card";
import Button from "@/src/components/ui/Button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number; // px
  closeOnBackdrop?: boolean; // por defecto false (mobile-first)
  closeOnEscape?: boolean; // por defecto false (mobile-first)
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 520,
  closeOnBackdrop = false,
  closeOnEscape = false,
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div
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
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth }}
      >
        <Card>
          {
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 14 }}>
                {title || ""}
              </div>

              <Button variant="secondary" onClick={onClose} style={{ padding: "6px 10px" }}>
                Cerrar
              </Button>
            </div>
          }

          {children}
        </Card>
      </div>
    </div>
  );
}