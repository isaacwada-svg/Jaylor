import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-control) text-sm font-(--btn-weight) cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-(--btn-primary-shadow) hover:bg-primary/90",
        premium:
          "bg-gradient-to-br from-gold-soft via-gold to-gold text-ink font-semibold shadow-float transition-all duration-200 hover:-translate-y-px hover:brightness-105 hover:shadow-lg focus-visible:ring-gold",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-(--btn-outline-border) bg-(--btn-outline-bg) text-(--btn-outline-fg) font-(--btn-outline-weight) shadow-sm transition-all duration-200 hover:border-(--btn-outline-border-hover) hover:bg-(--btn-outline-bg-hover) hover:shadow-float focus-visible:ring-gold",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-(--control-h) px-4 py-2",
        sm: "h-(--control-h-sm) rounded-(--radius-control) px-3 text-xs",
        lg: "h-(--control-h-lg) rounded-(--radius-control) px-8",
        icon: "size-(--control-icon)",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
