import React from "react";

export const MedalIcon = React.forwardRef<
  SVGSVGElement,
  React.SVGAttributes<SVGElement>
>(function MedalIcon(props, forwardedRef) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      ref={forwardedRef}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" />
      <path d="M11 12 5.12 2.2" />
      <path d="m13 12 5.88-9.8" />
      <path d="M8 7h8" />
      <circle cx="12" cy="17" r="5" fill="currentColor" stroke="currentColor" />
    </svg>
  );
});
