import { AppHeader } from "./AppHeader";

type WebPageProps = {
  children: React.ReactNode;
  inert?: boolean;
};

export const WebPage = ({ children, inert }: WebPageProps) => {
  return (
    <div
      ref={(node) =>
        node &&
        (inert ? node.setAttribute("inert", "") : node.removeAttribute("inert"))
      }
    >
      <AppHeader />
      {children}
    </div>
  );
};
