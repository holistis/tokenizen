import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-0.5 font-mono text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-muted-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        green: "border-transparent bg-halal-green-soft text-halal-green",
        yellow: "border-transparent bg-halal-yellow-soft text-halal-yellow",
        red: "border-transparent bg-halal-red-soft text-halal-red",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
