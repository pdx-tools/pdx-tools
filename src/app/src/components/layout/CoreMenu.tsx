import React from "react";
import { Button, Menu, MenuProps, Skeleton } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import Link from "next/link";
import {
  selectSession,
  selectUserInfo,
} from "../../features/account/sessionSlice";
import { SignInButtons } from "./auth";
import { GithubIcon, DiscordIcon } from "@/components/icons";
import { appApi } from "../../services/appApi";
import css from "styled-jsx/css";

const MySaves: React.FC<{}> = () => {
  let userInfo = useSelector(selectUserInfo);
  if (userInfo) {
    const key = `/users/${userInfo.user_id}`;
    return <Link href={key}>My Saves</Link>;
  } else {
    return null;
  }
};

const accountMenuOptions = (logout: () => void) => {
  return [
    <Menu.Item key="account:account">
      <Link href="/account">Account</Link>
    </Menu.Item>,
    <Menu.Item key="account:my-saves">
      <MySaves />
    </Menu.Item>,
    <Menu.Item key="account:logout" onClick={() => logout()}>
      Logout
    </Menu.Item>,
  ];
};

interface CoreMenuProps {
  mode: MenuProps["mode"];
}

const { className, styles } = css.resolve`
  div {
    display: flex;
    flex-grow: 1;
    align-self: center;
    justify-content: flex-end;
  }
`;

export const CoreMenu: React.FC<CoreMenuProps> = ({ mode }) => {
  const [logoutTrigger] = appApi.endpoints.logout.useMutation();
  const session = useSelector(selectSession);
  const inlined = mode == "inline";
  const defaultOpenedKeys = !inlined ? [] : ["eu4", "community", "account"];

  let accountSub;
  if (!inlined) {
    if (session.kind === "unknown") {
      accountSub = (
        <div className={className}>
          <Skeleton.Button className="flex-row" />
          {styles}
        </div>
      );
    } else if (session.kind === "guest") {
      accountSub = (
        <div className={className}>
          <SignInButtons />
          {styles}
        </div>
      );
    } else {
      accountSub = (
        <Menu.SubMenu
          key="account"
          icon={
            <Button
              shape="circle"
              icon={
                <UserOutlined
                  style={{
                    margin: 0,
                    display: "flex",
                    justifyContent: "center",
                  }}
                />
              }
            />
          }
          style={{
            display: "flex",
            flexGrow: 1,
            justifyContent: "end",
            alignSelf: "center",
          }}
        >
          {accountMenuOptions(logoutTrigger)}
        </Menu.SubMenu>
      );
    }
  } else {
    if (session.kind === "unknown") {
      accountSub = null;
    } else if (session.kind === "guest") {
      accountSub = (
        <div>
          <style jsx>{`
            div {
              display: flex;
              justify-content: center;
              padding-top: 1rem;
            }
          `}</style>
          <SignInButtons />
        </div>
      );
    } else {
      accountSub = (
        <Menu.SubMenu key="account" title="Account">
          {accountMenuOptions(logoutTrigger)}
        </Menu.SubMenu>
      );
    }
  }

  return (
    <Menu
      className="grow"
      style={{ display: !inlined ? "flex" : undefined }}
      theme="dark"
      mode={mode}
      defaultOpenKeys={defaultOpenedKeys}
    >
      <Menu.SubMenu key="eu4" title="EU4">
        <Menu.Item key="eu4:home">
          <Link href="/eu4">Home</Link>
        </Menu.Item>
        <Menu.Item key="eu4:achievements">
          <Link href="/eu4/achievements">Achievements</Link>
        </Menu.Item>
        <Menu.Item key="eu4:skanderbeg">
          <Link href="/eu4/skanderbeg">Skanderbeg</Link>
        </Menu.Item>
      </Menu.SubMenu>
      <Menu.Item key="changelog" title="Changelog">
        <Link href="/changelog">Changelog</Link>
      </Menu.Item>
      <Menu.SubMenu key="community" title="Community">
        <Menu.Item
          icon={<DiscordIcon style={{ height: "16px", width: "16px" }} />}
          key="community:1"
        >
          <a href="https://discord.gg/rCpNWQW">Discord</a>
        </Menu.Item>
        <Menu.Item
          icon={<GithubIcon style={{ height: "16px", width: "16px" }} />}
          key="community:2"
        >
          <a href="https://github.com/pdx-tools">Github</a>
        </Menu.Item>
        <Menu.Item key="community:3">
          <Link href="/docs">API</Link>
        </Menu.Item>
        <Menu.Item key="community:4">
          <a href="/blog">Blog</a>
        </Menu.Item>
        <Menu.Item key="community:5">
          <a href="https://github.com/sponsors/nickbabcock/">Sponsor</a>
        </Menu.Item>
      </Menu.SubMenu>
      {accountSub}
    </Menu>
  );
};
