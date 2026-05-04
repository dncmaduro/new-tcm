"use client";

import { ComponentPropsWithoutRef } from "react";
import { NumericFormat } from "react-number-format";

type FormattedNumberInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
};

export function FormattedNumberInput({
  value,
  onValueChange,
  defaultValue,
  ...props
}: FormattedNumberInputProps) {
  const normalizedDefaultValue =
    typeof defaultValue === "string" || typeof defaultValue === "number"
      ? defaultValue
      : undefined;

  return (
    <NumericFormat
      {...props}
      value={value === null || value === undefined ? "" : String(value)}
      defaultValue={normalizedDefaultValue}
      valueIsNumericString
      inputMode="decimal"
      thousandSeparator="."
      decimalSeparator=","
      allowedDecimalSeparators={[",", "."]}
      allowNegative={false}
      onValueChange={(values) => onValueChange(values.value)}
    />
  );
}
