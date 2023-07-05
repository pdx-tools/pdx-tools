import React from "react";

export const Divider = ({ children }: React.PropsWithChildren) => {
  return (
    <div className="relative flex w-full items-center py-5">
      <div className="w-8 border-0 border-t border-solid border-gray-400/30"></div>
      <span className="text-bold mx-4 flex-shrink hyphens-none whitespace-nowrap text-lg font-semibold">
        {children}
      </span>
      <div className="flex-grow border-0 border-t border-solid border-gray-400/30"></div>
    </div>
  );
};
