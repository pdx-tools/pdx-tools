import { cx } from "class-variance-authority";
import React from "react";

export const Divider = ({
  children,
  paddingClassNames = "py-5",
}: React.PropsWithChildren<{ paddingClassNames?: string }>) => {
  return (
    <div className={cx("relative flex w-full items-center", paddingClassNames)}>
      <div className="w-8 border-0 border-t border-solid border-gray-400/30"></div>
      <span className="text-bold mx-4 flex-shrink hyphens-none whitespace-nowrap text-lg font-semibold">
        {children}
      </span>
      <div className="flex-grow border-0 border-t border-solid border-gray-400/30"></div>
    </div>
  );
};
