"use client";

import React from "react";

type CardProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export default function Card({ children, style }: CardProps) {
  return (
    <div
      style={{
        border: "var(--border)",
        borderRadius: "var(--r-xl)",
        background: "var(--card)",
        boxShadow: "var(--shadow)",
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}