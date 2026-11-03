import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded border border-uncc-rule bg-white px-3 py-1 text-sm text-uncc-ink placeholder:text-uncc-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uncc-green/40 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[72px] w-full rounded border border-uncc-rule bg-white px-3 py-2 text-sm text-uncc-ink placeholder:text-uncc-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-uncc-green/40",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
