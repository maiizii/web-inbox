import React from "react";
import clsx from "clsx";

export default function Card({ children, className, ...rest }) {
  return (
    <div
      className={clsx(
        "card p-4 fade-in",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
