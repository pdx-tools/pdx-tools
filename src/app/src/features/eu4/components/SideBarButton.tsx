import React from "react";

export interface SideBarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  index?: number;
}

export const SideBarButton = ({ children, ...rest }: SideBarButtonProps) => {
  return (
    <button
      className={`inline-flex items-center justify-end gap-3 rounded-lg border-0 bg-transparent p-0 px-2 py-2 opacity-60 transition-opacity duration-100 hover:bg-sky-900 hover:opacity-100`}
      {...rest}
    >
      {children}
    </button>
  );
};
