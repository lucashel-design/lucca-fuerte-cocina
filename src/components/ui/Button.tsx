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
    border: "var(--border)",
    borderRadius: "var(--r-lg)" as any, // CSS var string
    padding: "12px 12px",
    fontWeight: 900,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.6 : 1,
    transition: "transform 0.03s ease",
  };

  const variants: Record<ButtonVariant, React.CSSProperties> = {
    // primary: botón “negro” (en realidad, usa fg como fondo)
    primary: { background: "var(--fg)", color: "var(--bg)" },
    // secondary: botón “blanco” (en realidad, usa card como fondo)
    secondary: { background: "var(--card)", color: "var(--fg)" },
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