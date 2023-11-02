import React from "react";
import { AppSvg } from "../icons/AppIcon";
import { AnnouncementBar } from "./AnnouncementBar";
import { useEngineActions } from "@/features/engine";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Link } from "@/components/Link";
import { pdxApi, sessionSelect } from "@/services/appApi";
import { SignInButtons } from "./auth";
import { Button } from "@/components/Button";
import { UserIcon } from "@heroicons/react/24/outline";
import { DiscordIcon, GithubIcon } from "../icons";

const HeaderMenu = () => {
  const session = pdxApi.session.useCurrent();

  return (
    <>
      <NavigationMenu>
        <NavigationMenu.List>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className="px-4 py-2">
              EU4
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className="bg-[#001529] p-4">
              <NavigationMenu.Link variant="button" asChild>
                <Link href="/eu4">Recent saves</Link>
              </NavigationMenu.Link>
              <NavigationMenu.Link variant="button" asChild>
                <Link href="/eu4/achievements">Achievements</Link>
              </NavigationMenu.Link>
              <NavigationMenu.Link variant="button" asChild>
                <Link href="/eu4/skanderbeg">Skanderbeg</Link>
              </NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className="px-4 py-2">
              About
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className="bg-[#001529] p-4">
              <NavigationMenu.Link asChild variant="button">
                <Link href="/changelog">Changelog</Link>
              </NavigationMenu.Link>
              <NavigationMenu.Link variant="button" asChild>
                <Link href="/docs">Docs</Link>
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
                <Link href="/blog">Blog</Link>
              </NavigationMenu.Link>

              <NavigationMenu.Link variant="button" asChild>
                <Link href="https://github.com/sponsors/nickbabcock">
                  Donate
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu>

      <div className="flex grow justify-end self-center text-end items-center gap-6">
        <Link
          href="https://github.com/pdx-tools/pdx-tools"
          className="hidden lg:block opacity-75 hover:opacity-100 focus-visible:opacity-100"
        >
          <GithubIcon className="h-6 w-6 text-white" />
          <span className="sr-only">Github repo</span>
        </Link>

        <Link
          href="https://discord.gg/rCpNWQW"
          className="hidden lg:block opacity-75 hover:opacity-100 focus-visible:opacity-100"
        >
          <DiscordIcon className="h-6 w-6" />
          <span className="sr-only">Discord</span>
        </Link>

        {session.data === undefined ? null : !sessionSelect.isLoggedIn(
            session,
          ) ? (
          <SignInButtons />
        ) : (
          <NavigationMenu>
            <NavigationMenu.List>
              <NavigationMenu.Item className="mr-16 xl:mr-0">
                <NavigationMenu.Trigger asChild>
                  <Button shape="circle">
                    <UserIcon className="h-4 w-4 text-black" />
                    <span className="sr-only">Account</span>
                  </Button>
                </NavigationMenu.Trigger>

                <NavigationMenu.Content className="items-center bg-[#001529] p-4">
                  <NavigationMenu.Link variant="button" asChild>
                    <Link href="/account">Accout</Link>
                  </NavigationMenu.Link>

                  <NavigationMenu.Link
                    variant="button"
                    asChild
                    className="no-break"
                  >
                    <Link href={`/users/${session.data.user.user_id}`}>
                      My Saves
                    </Link>
                  </NavigationMenu.Link>
                  <NavigationMenu.Link variant="button" asChild>
                    <form method="POST" action="/api/logout">
                      <button type="submit">Logout</button>
                    </form>
                  </NavigationMenu.Link>
                </NavigationMenu.Content>
              </NavigationMenu.Item>
            </NavigationMenu.List>
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

      <div className="h-16 bg-[#001529] px-4">
        <div className="mx-auto flex h-full w-full max-w-screen-xl items-center">
          <Link
            href="/"
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
