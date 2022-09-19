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

export const CurrentAnnouncement: (() => React.ReactElement) | null = () => (
  <div>
    Vote for what's next in PDX Tools with{" "}
    <a
      target="_blank"
      rel="noopener noreferrer"
      href="https://strawpoll.vote/polls/axicc6u8/vote?s=0"
      className="text-white underline hover:text-white"
    >
      a 2 question survey
    </a>
  </div>
);

export const AppHeader = ({ disabled = false }: AppHeaderProps) => {
  return (
    <div
      className="flex flex-col"
      style={{ display: disabled ? "none" : "flex" }}
    >
      {CurrentAnnouncement && (
        <AnnouncementBar>
          <CurrentAnnouncement />
        </AnnouncementBar>
      )}

      <Header style={{ padding: "0 16px" }}>
        <div className="mx-auto flex h-full w-full items-center">
          <Link href="/">
            <a className="mr-3 flex items-center gap-1 text-3xl text-white hover:text-white hover:underline">
              <span className="float-left inline-flex">
                <AppSvg width="48" />
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
