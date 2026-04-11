"use client";

import React from "react";
import Card from "@/src/components/ui/Card";
import Button from "@/src/components/ui/Button";

type StateProps = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function State({ title, message, actionLabel, onAction }: StateProps) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <Card>
        <h1 style={{ fontSize: 20, fontWeight: 950, margin: "0 0 8px" }}>{title}</h1>
        {message ? <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.35 }}>{message}</p> : null}

        {actionLabel && onAction ? (
          <div style={{ marginTop: 12 }}>
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        ) : null}
      </Card>
    </main>
  );
}