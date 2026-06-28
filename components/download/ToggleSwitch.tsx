"use client";

import React from "react";

export const ToggleSwitch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) => (
  <label className="flex items-center gap-2.5 cursor-pointer select-none">
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-[140ms] ease-in-out focus:outline-none ${
        checked ? "bg-[var(--accent-ember)]" : "bg-[var(--border-strong)]"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-[140ms] ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
    <span className="text-xs text-[var(--text-secondary)]">{label}</span>
  </label>
);
