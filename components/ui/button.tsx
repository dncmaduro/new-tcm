import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline";
type ButtonSize = "default" | "sm" | "icon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: "border border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
  outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-4 text-sm font-semibold",
  sm: "h-9 px-3 text-sm font-semibold",
  icon: "h-9 w-9",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-xl align-middle whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
