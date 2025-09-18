import React from "react";
import { clsx } from "clsx";

export default function Button({
  variant = "primary",
  className,
  children,
  ...rest
}) {
  return (
    <button
      className={clsx(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "outline" && "btn-outline",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
