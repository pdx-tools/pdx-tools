import React from "react";
import { AppSvg } from "../icons/AppIcon";
import { DiscordIcon, GithubIcon } from "../icons";
import { AnnouncementBar } from "./AnnouncementBar";
import { useEngineActions } from "@/features/engine";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Link } from "@/components/Link";
import { Tooltip } from "@/components/Tooltip";
import { SignInButtons } from "./auth";
import { Button } from "@/components/Button";
import { ArrowUpRightIcon, UserIcon } from "@heroicons/react/24/outline";
import { cx } from "class-variance-authority";
import { useSession } from "@/features/account";
import { analysisGames } from "@/lib/games";
import { DISCORD_INVITE_URL } from "@/lib/links";
import { Form } from "react-router";
import { WhatsNewButton } from "@/features/whats-new/WhatsNewButton";
import { WhatsNewDrawer } from "@/features/whats-new/WhatsNewDrawer";
import { WhatsNewBanner } from "@/features/whats-new/WhatsNewBanner";
import { useWhatsNew } from "@/features/whats-new/useWhatsNew";

/** One row of a header menu: a title, and an optional line that says what is behind it. */
// `items-start!` wins over the `items-center` that the menu link style sets.
const menuRow =
  "flex flex-col items-start! gap-0.5 rounded px-3 py-2 text-left hover:bg-sky-800 hover:no-underline focus-visible:bg-sky-800";

/**
 * The games menu. Analysis games lead, each under the short name players
 * use. A game without a hub leads to its campaigns in the saves feed. The
 * melt-only games share one row, because they share the one thing the tool
 * does for them. That row leads to the list on the landing page, where a
 * save is dropped.
 */
const GamesContent = () => (
  <NavigationMenu.Content className="bg-slate-900 p-3">
    <div className="flex w-max max-w-[calc(100vw-2rem)] min-w-32 flex-col">
      {analysisGames.map((game) => (
        <NavigationMenu.Link key={game.id} asChild>
          <Link variant="ghost" to={game.to ?? `/saves?game=${game.id}`} className={menuRow}>
            <span className="text-sm font-semibold text-white">{game.label}</span>
          </Link>
        </NavigationMenu.Link>
      ))}
    </div>
  </NavigationMenu.Content>
);

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-36 flex-col">
      <div className="px-3 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.14em] text-gray-400 uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function ExternalMenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <NavigationMenu.Link asChild>
      <Link variant="ghost" href={href} className={cx(menuRow, "flex-row items-center! gap-1.5")}>
        <span className="text-sm text-white">{children}</span>
        <ArrowUpRightIcon className="h-3.5 w-3.5 text-gray-400" aria-hidden />
        <span className="sr-only">(opens another site)</span>
      </Link>
    </NavigationMenu.Link>
  );
}

function SiteMenuLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <NavigationMenu.Link asChild className={className}>
      <Link variant="ghost" href={href} className={menuRow}>
        <span className="text-sm text-white">{children}</span>
      </Link>
    </NavigationMenu.Link>
  );
}

/**
 * The about menu, in two groups: what there is to read on this site, and
 * where the people behind it are. The changelog hides on wide screens,
 * where the header shows "What's New" beside the menus.
 */
const AboutContent = () => (
  <NavigationMenu.Content className="bg-slate-900 p-3">
    <div className="grid w-max grid-cols-2 gap-x-2">
      <MenuGroup label="Read">
        <SiteMenuLink href="/changelog" className="lg:hidden">
          Changelog
        </SiteMenuLink>
        <SiteMenuLink href="/docs">Docs</SiteMenuLink>
        <SiteMenuLink href="/blog">Blog</SiteMenuLink>
      </MenuGroup>
      <MenuGroup label="Community">
        <ExternalMenuLink href={DISCORD_INVITE_URL}>Discord</ExternalMenuLink>
        <ExternalMenuLink href="https://github.com/pdx-tools/pdx-tools">GitHub</ExternalMenuLink>
        <ExternalMenuLink href="https://github.com/sponsors/nickbabcock">Donate</ExternalMenuLink>
      </MenuGroup>
    </div>
  </NavigationMenu.Content>
);

/**
 * A community link as an icon, for wide screens. The About menu lists the
 * same links as text at every width, so the icon is a shortcut and not the
 * only way there. The target is 40px square around a 24px glyph.
 */
function CommunityIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Link
          variant="ghost"
          href={href}
          aria-label={label}
          className="flex h-10 w-10 items-center justify-center rounded-md opacity-75 outline-hidden transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          {children}
        </Link>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

const HeaderMenu = () => {
  const session = useSession();

  return (
    <>
      <NavigationMenu>
        <NavigationMenu.List>
          <NavigationMenu.Item>
            <NavigationMenu.Link variant="button" asChild>
              <Link variant="ghost" to="/saves">
                Saves
              </Link>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className="px-2 py-2 sm:px-4">Games</NavigationMenu.Trigger>
            <GamesContent />
          </NavigationMenu.Item>
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className="px-2 py-2 sm:px-4">About</NavigationMenu.Trigger>
            <AboutContent />
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Viewport />
      </NavigationMenu>

      <div className="flex grow items-center justify-end gap-4 self-center text-end lg:gap-6">
        <div className="hidden items-center gap-1 lg:flex">
          <CommunityIconLink href={DISCORD_INVITE_URL} label="Discord">
            <DiscordIcon className="h-6 w-6 text-white" />
          </CommunityIconLink>
          <CommunityIconLink href="https://github.com/pdx-tools/pdx-tools" label="GitHub">
            <GithubIcon className="h-6 w-6 text-white" />
          </CommunityIconLink>
        </div>

        <div className="hidden lg:block">
          <WhatsNewMenuItem />
        </div>

        {session.id === undefined ? (
          <SignInButtons />
        ) : (
          <NavigationMenu>
            <NavigationMenu.List>
              <NavigationMenu.Item className="mr-4 xl:mr-0">
                <NavigationMenu.Trigger asChild>
                  <Button shape="circle" style={{ backgroundColor: "white" }}>
                    <UserIcon className="h-4 w-4 text-black" />
                    <span className="sr-only">Account</span>
                  </Button>
                </NavigationMenu.Trigger>

                <NavigationMenu.Content className="items-center bg-slate-900 p-4">
                  <NavigationMenu.Link variant="button" asChild>
                    <Link variant="ghost" to="/account">
                      Account
                    </Link>
                  </NavigationMenu.Link>

                  <NavigationMenu.Link variant="button" asChild className="no-break">
                    <Link variant="ghost" to={`/users/${session.id}`}>
                      My campaigns
                    </Link>
                  </NavigationMenu.Link>
                  <NavigationMenu.Link variant="button" asChild>
                    <Form action="/logout" method="post">
                      <button type="submit">Logout</button>
                    </Form>
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

export const CurrentAnnouncement: (() => React.ReactElement) | undefined = undefined as unknown as
  | (() => React.ReactElement)
  | undefined;

export const AppHeader = () => {
  const { resetSaveAnalysis } = useEngineActions();

  return (
    <div className="flex flex-col">
      {CurrentAnnouncement && (
        <AnnouncementBar>
          <CurrentAnnouncement />
        </AnnouncementBar>
      )}
      <WhatsNewBanner />

      <div className="h-16 bg-slate-900 px-4 max-[359px]:px-3">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center">
          <Link
            to="/"
            variant="ghost"
            className="mr-3 flex shrink-0 items-center gap-1 text-3xl text-white hover:text-white hover:underline"
            onClick={() => resetSaveAnalysis()}
          >
            <span className="float-left inline-flex">
              <AppSvg
                width={48}
                height={48}
                className="h-10 w-10 max-[359px]:h-8 max-[359px]:w-8 sm:h-12 sm:w-12"
              />
            </span>
            <span className="hidden sm:block">PDX Tools</span>
          </Link>
          <HeaderMenu />
        </div>
      </div>
    </div>
  );
};

const WhatsNewMenuItem = () => {
  const { hasUnread } = useWhatsNew();

  // If we have unread then we can show the drawer, otherwise
  // we'll just link out to the changelog page.
  if (hasUnread) {
    return (
      <WhatsNewDrawer>
        <WhatsNewButton />
      </WhatsNewDrawer>
    );
  } else {
    return <WhatsNewButton isLink />;
  }
};
