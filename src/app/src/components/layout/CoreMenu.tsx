import React from "react";
import { Button, Menu, MenuProps, Skeleton } from "antd";
import { UserOutlined } from "@ant-design/icons";
import Link from "next/link";
import { SignInButtons } from "./auth";
import { GithubIcon, DiscordIcon } from "@/components/icons";
import {
  PrivateUserInfo,
  useLogoutMutation,
  useProfileQuery,
} from "../../services/appApi";

type Items = React.ComponentProps<typeof Menu>["items"];

const MySaves = (userInfo: PrivateUserInfo) => {
  const key = `/users/${userInfo.user_id}`;
  return <Link href={key}>My Saves</Link>;
};

const accountMenuOptions = (
  userInfo: PrivateUserInfo,
  logout: () => void
): Items => {
  return [
    { key: "account:account", label: <Link href="/account">Account</Link> },
    { key: "account:my-saves", label: <MySaves {...userInfo} /> },
    { key: "account:logout", onClick: () => logout(), label: "Logout" },
  ];
};

type CoreMenuProps = {
  mode: MenuProps["mode"];
  className?: string;
};

export const CoreMenu = ({ mode, className }: CoreMenuProps) => {
  const logout = useLogoutMutation();
  const profileQuery = useProfileQuery();
  const inlined = mode == "inline";
  const defaultOpenedKeys = !inlined ? [] : ["eu4", "community", "account"];

  const items: Items = [
    {
      key: "eu4",
      label: "EU4",
      children: [
        { key: "eu4:home", label: <Link href="/eu4">Home</Link> },
        {
          key: "eu4:achievements",
          label: <Link href="/eu4/achievements">Achievements</Link>,
        },
        {
          key: "eu4:skanderbeg",
          label: <Link href="/eu4/skanderbeg">Skanderbeg</Link>,
        },
      ],
    },
    {
      key: "changelog",
      label: <Link href="/changelog">Changelog</Link>,
    },
    {
      key: "docs",
      label: <Link href="/docs">Docs</Link>,
    },
    {
      key: "community",
      label: "Community",
      children: [
        {
          key: "community:1",
          icon: <DiscordIcon style={{ height: "16px", width: "16px" }} />,
          label: <a href="https://discord.gg/rCpNWQW">Discord</a>,
        },
        {
          key: "community:2",
          icon: <GithubIcon style={{ height: "16px", width: "16px" }} />,
          label: <a href="https://github.com/pdx-tools">Github</a>,
        },
        {
          key: "community:3",
          label: <Link href="/docs">API</Link>,
        },
        {
          key: "community:4",
          label: <a href="/blog">Blog</a>,
        },
        {
          key: "community:5",
          label: <a href="https://github.com/sponsors/nickbabcock/">Sponsor</a>,
        },
      ],
    },
  ];

  const isSubmenu = inlined && profileQuery.data?.kind == "user";
  let accountSub = null;
  if (!inlined) {
    if (profileQuery.data && profileQuery.data.kind === "user") {
      accountSub = (
        <Menu
          theme="dark"
          mode="horizontal"
          className="grow justify-end"
          items={[
            {
              key: "account",
              icon: (
                <Button
                  shape="circle"
                  icon={<UserOutlined className="m-0 flex justify-center" />}
                />
              ),
              children: accountMenuOptions(
                profileQuery.data.user,
                logout.mutate
              ),
            },
          ]}
        />
      );
    } else {
      accountSub = (
        <div className="flex grow justify-end self-center text-end">
          {profileQuery.data === undefined ? (
            <Skeleton.Button className="flex items-center" />
          ) : (
            <SignInButtons />
          )}
        </div>
      );
    }
  } else {
    if (profileQuery.data === undefined) {
      accountSub = null;
    } else if (profileQuery.data.kind === "guest") {
      accountSub = (
        <div className="flex justify-center pt-4">
          <SignInButtons />
        </div>
      );
    } else {
      items.push({
        key: "account",
        label: "Account",
        children: accountMenuOptions(profileQuery.data.user, logout.mutate),
      });
    }
  }

  const menu = (
    <Menu
      className="grow"
      style={{ display: !inlined ? "flex" : undefined }}
      theme="dark"
      mode={mode}
      defaultOpenKeys={defaultOpenedKeys}
      items={items}
    >
      {isSubmenu && accountSub}
    </Menu>
  );

  if (isSubmenu) {
    return menu;
  } else {
    return (
      <div
        className={`${className ?? "flex"} grow ${
          inlined ? "flex-col" : "flex-row"
        }`}
      >
        {menu}
        {accountSub}
      </div>
    );
  }
};
