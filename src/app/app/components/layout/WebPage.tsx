import { AppHeader } from "./AppHeader";

type WebPageProps = {
  children: React.ReactNode;
  inert?: boolean;
};

export const WebPage = ({ children, inert }: WebPageProps) => {
  return (
    <div
      ref={(node) => {
        if (node) {
          if (inert) {
            node.setAttribute("inert", "");
          } else {
            node.removeAttribute("inert");
          }
        }
      }}
    >
      <AppHeader />
      {children}
    </div>
  );
};
