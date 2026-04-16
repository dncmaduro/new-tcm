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
  ...props
}: FormattedNumberInputProps) {
  return (
    <NumericFormat
      {...props}
      value={value === null || value === undefined ? "" : String(value)}
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
