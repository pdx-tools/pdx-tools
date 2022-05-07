import React from "react";
import { FlipBook } from "./FlipBook";

interface StringFlipBookProps {
  items: string[];
}

export const StringFlipBook = ({ items }: StringFlipBookProps) => {
  return <FlipBook items={items} itemRender={(x) => <span>{x}</span>} />;
};
