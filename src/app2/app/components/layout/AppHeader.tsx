import React from "react";
import { AppSvg } from "../icons/AppIcon";
import { AnnouncementBar } from "./AnnouncementBar";
import { useEngineActions } from "@/features/engine";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Link } from "@/components/Link";
import { sessionSelect } from "@/services/appApi";
import { SignInButtons } from "./auth";
import { Button } from "@/components/Button";
import { UserIcon } from "@heroicons/react/24/outline";
import { DiscordIcon, GithubIcon } from "../icons";
import { resetLogging } from "@/lib/events";
import { useSession } from "@/features/account";

const HeaderMenu = () => {
  const session = useSession();

  return (
    <>
      <NavigationMenu>
        <NavigationMenu.List>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className="px-4 py-2">
              EU4
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className="bg-slate-900 p-4">
              <NavigationMenu.Link variant="button" asChild>
                <Link variant="ghost" to="/eu4">
                  Recent saves
                </Link>
              </NavigationMenu.Link>
              <NavigationMenu.Link variant="button" asChild>
                <Link variant="ghost" to="/eu4/achievements">
                  Achievements
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className="px-4 py-2">
              About
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className="bg-slate-900 p-4">
              <NavigationMenu.Link asChild variant="button">
                <Link variant="ghost" href="/changelog">
                  Changelog
                </Link>
              </NavigationMenu.Link>
              <NavigationMenu.Link variant="button" asChild>
                <Link variant="ghost" href="/docs">
                  Docs
                </Link>
              </NavigationMenu.Link>
              <NavigationMenu.Link
                variant="button"
                asChild
                className="lg:hidden"
              >
                <Link href="https://discord.gg/rCpNWQW">Discord</Link>
              </NavigationMenu.Link>
              <NavigationMenu.Link
                variant="button"
                asChild
                className="lg:hidden"
              >
                <Link href="https://github.com/pdx-tools/pdx-tools">
                  Github
                </Link>
              </NavigationMenu.Link>
              <NavigationMenu.Link variant="button" asChild>
                <Link variant="ghost" href="/blog">
                  Blog
                </Link>
              </NavigationMenu.Link>

              <NavigationMenu.Link variant="button" asChild>
                <Link
                  variant="ghost"
                  href="https://github.com/sponsors/nickbabcock"
                >
                  Donate
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Viewport />
      </NavigationMenu>

      <div className="flex grow items-center justify-end gap-6 self-center text-end">
        <Link
          href="https://github.com/pdx-tools/pdx-tools"
          className="hidden opacity-75 hover:opacity-100 focus-visible:opacity-100 lg:block"
        >
          <GithubIcon className="h-6 w-6 text-white" />
          <span className="sr-only">Github repo</span>
        </Link>

        <Link
          href="https://discord.gg/rCpNWQW"
          className="hidden opacity-75 hover:opacity-100 focus-visible:opacity-100 lg:block"
        >
          <DiscordIcon className="h-6 w-6" />
          <span className="sr-only">Discord</span>
        </Link>

        {session.kind === "guest" ? (
          <SignInButtons />
        ) : (
          <NavigationMenu>
            <NavigationMenu.List>
              <NavigationMenu.Item className="mr-16 xl:mr-0">
                <NavigationMenu.Trigger asChild>
                  <Button shape="circle" style={{ backgroundColor: "white" }}>
                    <UserIcon className="h-4 w-4 text-black" />
                    <span className="sr-only">Account</span>
                  </Button>
                </NavigationMenu.Trigger>

                <NavigationMenu.Content className="items-center bg-slate-900 p-4">
                  <NavigationMenu.Link variant="button" asChild>
                    <Link variant="ghost" href="/account">
                      Accout
                    </Link>
                  </NavigationMenu.Link>

                  <NavigationMenu.Link
                    variant="button"
                    asChild
                    className="no-break"
                  >
                    <Link
                      variant="ghost"
                      to="/users/$userId"
                      params={{ userId: session.userId }}
                    >
                      My Saves
                    </Link>
                  </NavigationMenu.Link>
                  <NavigationMenu.Link variant="button" asChild>
                    <Link
                      variant="ghost"
                      to="/logout"
                      onClick={() => {
                        resetLogging();
                      }}
                    >
                      Logout
                    </Link>
                  </NavigationMenu.Link>
                </NavigationMenu.Content>
              </NavigationMenu.Item>
            </NavigationMenu.List>
            <NavigationMenu.Viewport className="right-0" />
          </NavigationMenu>
        )}
      </div>
    </>
  );
};

export const CurrentAnnouncement: (() => React.ReactElement) | undefined =
  undefined as unknown as (() => React.ReactElement) | undefined;

export const AppHeader = () => {
  const { resetSaveAnalysis } = useEngineActions();
  return (
    <div className="flex flex-col">
      {CurrentAnnouncement && (
        <AnnouncementBar>
          <CurrentAnnouncement />
        </AnnouncementBar>
      )}

      <div className="h-16 bg-slate-900 px-4">
        <div className="mx-auto flex h-full w-full max-w-screen-xl items-center">
          <Link
            to="/"
            variant="ghost"
            className="mr-3 flex items-center gap-1 text-3xl text-white hover:text-white hover:underline"
            onClick={() => resetSaveAnalysis()}
          >
            <span className="float-left inline-flex">
              <AppSvg width={48} height={48} />
            </span>
            <span className="hidden sm:block">PDX Tools</span>
          </Link>
          <HeaderMenu />
        </div>
      </div>
    </div>
  );
};
