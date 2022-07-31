import React from "react";
import Link from "next/link";
import { Layout, Grid } from "antd";
import { AppSvg } from "../icons/AppIcon";
import { CoreMenu } from "./CoreMenu";
import { MobileMenu } from "./MobileMenu";
import { AnnouncementBar } from "./AnnouncementBar";
const { Header } = Layout;
const { useBreakpoint } = Grid;

const HeaderMenu = () => {
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

export const CurrentAnnouncement: React.ReactNode | null = null;

export const AppHeader = ({ disabled = false }: AppHeaderProps) => {
  return (
    <div
      className="flex flex-col"
      style={{ display: disabled ? "none" : "flex" }}
    >
      {CurrentAnnouncement && (
        <AnnouncementBar>{CurrentAnnouncement}</AnnouncementBar>
      )}

      <Header style={{ padding: "0 16px" }}>
        <div className="flex items-center mx-auto w-full h-full max-w-screen-xl">
          <Link href="/">
            <a className="flex text-3xl text-white hover:text-white items-center mr-3 gap-1 hover:underline">
              <span className="float-left inline-flex">
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
