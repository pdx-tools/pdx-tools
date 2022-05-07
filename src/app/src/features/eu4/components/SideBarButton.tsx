import React from "react";
import { Shadow } from "@/components/Shadow";

export interface SideBarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  index?: number;
}

export const SideBarButton = ({
  index,
  children,
  ...rest
}: SideBarButtonProps) => {
  const btnHsl: [number, number, number] = [0, 56, 47];
  const clazz = index !== undefined ? ` btn-${index}` : "";
  return (
    <Shadow size="small" backgroundColor={btnHsl}>
      <button className={`btn${clazz}`} {...rest}>
        {children}
      </button>
      <style jsx>{`
        .btn-${index} {
          animation: slideIn ${1 - 0.1 * (index || 0 + 1)}s ease-out;
        }

        @keyframes slideIn {
          0% {
            transform: translateX(200px);
          }
          100% {
            transform: translateX(0);
          }
        }
      `}</style>
      <style jsx>{`
        .btn {
          width: 60px;
          height: 60px;
          background-color: hsl(${btnHsl[0]}deg, ${btnHsl[1]}%, ${btnHsl[2]}%);
          border: transparent;
          border-radius: 2px;
          box-shadow: inset 0 0 30px #333;
        }

        .btn:active {
          border-color: black;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15),
            inset 0 0 6px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </Shadow>
  );
};
