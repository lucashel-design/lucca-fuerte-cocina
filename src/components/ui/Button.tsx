"use client";

import React from "react";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  style?: React.CSSProperties;
};

export default function Button({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = "primary",
  type = "button",
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const base: React.CSSProperties = {
    border: "1px solid #111",
    borderRadius: 14,
    padding: "12px 12px",
    fontWeight: 900,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.6 : 1,
    transition: "transform 0.03s ease",
  };

  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: "#111", color: "#fff" },
    secondary: { background: "#fff", color: "#111" },
  };

  return (
    <button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {loading ? "…" : children}
    </button>
  );
}