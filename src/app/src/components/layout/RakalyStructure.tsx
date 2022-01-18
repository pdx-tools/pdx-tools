import React from "react";
import { Layout } from "antd";
import { useSelector } from "react-redux";
import { SessionProvider } from "@/features/account";
import { selectAppHeaderVisible, WasmWorkerProvider } from "@/features/engine";
import { AnalyticsScript } from "./AnalyticsScript";
import { AppHeader } from "./AppHeader";
import { ErrorCatcher } from "./ErrorCatcher";
const { Content } = Layout;

export const RakalyHeader: React.FC<{}> = () => {
  const showBackdrop = useSelector(selectAppHeaderVisible);

  return <AppHeader disabled={!showBackdrop} />;
};

interface RakalyStructureProps {
  header?: boolean;
}

export const RakalyStructure: React.FC<RakalyStructureProps> = ({
  header = true,
  children,
}) => {
  return (
    <SessionProvider>
      <WasmWorkerProvider>
        <AnalyticsScript />
        <Layout style={{ backgroundColor: "white", height: "100%" }}>
          {header && <RakalyHeader />}
          <Content className="flex-col" style={{ overflow: "auto" }}>
            <ErrorCatcher>{children}</ErrorCatcher>
          </Content>
        </Layout>
      </WasmWorkerProvider>
    </SessionProvider>
  );
};
