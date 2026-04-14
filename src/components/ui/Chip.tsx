"use client";

import React from "react";

type ChipProps = {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
};

export default function Chip({ children, active = false, onClick, disabled = false, style }: ChipProps) {
  const base: React.CSSProperties = {
    border: "var(--border)",
    borderRadius: 999,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    background: active ? "var(--fg)" : "var(--card)",
    color: active ? "var(--bg)" : "var(--fg)",
  };

  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...style }}>
      {children}
    </button>
  );
}