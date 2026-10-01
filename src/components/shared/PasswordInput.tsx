"use client";

import { useState } from "react";

export function PasswordInput({
  value,
  onChange,
  placeholder,
  required,
  className,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${className ?? ""} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" />
            <circle cx="10" cy="10" r="2.5" />
            <line x1="3" y1="17" x2="17" y2="3" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" />
            <circle cx="10" cy="10" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}
