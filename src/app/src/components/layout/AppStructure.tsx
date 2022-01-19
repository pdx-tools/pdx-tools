import React from "react";
import { Layout } from "antd";
import { useSelector } from "react-redux";
import { SessionProvider } from "@/features/account";
import { selectAppHeaderVisible, WasmWorkerProvider } from "@/features/engine";
import { UserMetricsScript } from "./UserMetricsScript";
import { AppHeader } from "./AppHeader";
import { ErrorCatcher } from "./ErrorCatcher";
const { Content } = Layout;

interface AppStructureProps {
  header?: boolean;
}

export const AppStructure: React.FC<AppStructureProps> = ({
  header = true,
  children,
}) => {
  const visibleHeader = useSelector(selectAppHeaderVisible);
  return (
    <SessionProvider>
      <WasmWorkerProvider>
        <UserMetricsScript />
        <Layout style={{ backgroundColor: "white", height: "100%" }}>
          {header && <AppHeader disabled={!visibleHeader} />}
          <Content className="flex-col" style={{ overflow: "auto" }}>
            <ErrorCatcher>{children}</ErrorCatcher>
          </Content>
        </Layout>
      </WasmWorkerProvider>
    </SessionProvider>
  );
};
