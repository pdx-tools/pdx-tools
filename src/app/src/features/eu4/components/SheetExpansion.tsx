import React, { ReactNode, useState } from "react";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { PlusCircleTwoTone } from "@ant-design/icons";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/Button";
import { cx } from "class-variance-authority";

export const SheetExpansion = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Sheet modal={true}>
      <Sheet.Trigger asChild>
        <Button variant="ghost" shape="none">
          <span className="sr-only">{title}</span>
          <PlusCircleTwoTone />
        </Button>
      </Sheet.Trigger>
      <Sheet.Content
        side="right"
        className={cx(
          "flex flex-col bg-white pt-4 transition-[width] duration-200",
          expanded ? "w-full" : "w-[800px] max-w-full"
        )}
      >
        <Sheet.Header className="z-[1] flex gap-2 px-4 pb-4 shadow-md">
          <Sheet.Close />
          <Button
            shape="square"
            onClick={() => setExpanded(!expanded)}
            className="hidden md:flex"
          >
            {expanded ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            <span className="sr-only">{expanded ? "Fold" : "Expand"}</span>
          </Button>
          <Sheet.Title>{title}</Sheet.Title>
        </Sheet.Header>
        <Sheet.Body className="px-4 pt-6">{children}</Sheet.Body>
      </Sheet.Content>
    </Sheet>
  );
};
