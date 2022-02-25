import React from "react";
import Link from "next/link";
import { Layout, Grid } from "antd";
import { AppSvg } from "../icons/AppIcon";
import { CoreMenu } from "./CoreMenu";
import { MobileMenu } from "./MobileMenu";
const { Header } = Layout;
const { useBreakpoint } = Grid;

const HeaderMenu: React.FC<{}> = () => {
  const { md } = useBreakpoint();

  if (md === undefined) {
    return null;
  } else if (md) {
    return <CoreMenu mode="horizontal" />;
  } else {
    return <MobileMenu />;
  }
};

interface AppHeaderProps {
  disabled?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ disabled = false }) => {
  return (
    <div className="flex-col" style={{ display: disabled ? "none" : "flex" }}>
      <Header style={{ padding: "0 16px" }}>
        <div className="flex-row items-center menu">
          <style jsx>{`
            .logo:hover {
              text-decoration: revert;
            }

            .logo span {
              float: left;
              display: inline-flex;
            }

            .logo {
              display: flex;
              color: white;
              font-size: 2rem;
              align-items: center;
              gap: 4px;
              margin-right: 1em;
            }

            .menu {
              width: min(100%, 1400px);
              margin: 0 auto;
            }
          `}</style>
          <Link href="/">
            <a className="logo">
              <span>
                <AppSvg width="3rem" height="3rem" />
              </span>
              PDX Tools
            </a>
          </Link>
          <HeaderMenu />
        </div>
      </Header>
    </div>
  );
};
