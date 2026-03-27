"use client";

import { ComponentPropsWithoutRef, useState } from "react";

type ClearableNumberInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "value" | "onChange"
> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
};

const toInputValue = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "";
  }
  return String(value);
};

export function ClearableNumberInput({
  value,
  onValueChange,
  onBlur,
  onFocus,
  ...props
}: ClearableNumberInputProps) {
  const [draftValue, setDraftValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  return (
    <input
      {...props}
      type="number"
      value={isEditing ? draftValue : toInputValue(value)}
      onFocus={(event) => {
        setDraftValue(toInputValue(value));
        setIsEditing(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const rawValue = event.target.value;
        setDraftValue(rawValue);

        if (!rawValue.trim()) {
          return;
        }

        const nextValue = Number(rawValue);
        if (Number.isFinite(nextValue)) {
          onValueChange(nextValue);
        }
      }}
      onBlur={(event) => {
        setIsEditing(false);

        const rawValue = event.target.value.trim();
        if (!rawValue) {
          setDraftValue(toInputValue(value));
          onBlur?.(event);
          return;
        }

        const nextValue = Number(rawValue);
        if (Number.isFinite(nextValue)) {
          onValueChange(nextValue);
          setDraftValue(String(nextValue));
        } else {
          setDraftValue(toInputValue(value));
        }

        onBlur?.(event);
      }}
    />
  );
}
