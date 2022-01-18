import React from "react";
import { FlipBook } from "./FlipBook";

interface StringFlipBookProps {
  items: string[];
}

export const StringFlipBook: React.FC<StringFlipBookProps> = ({ items }) => {
  return <FlipBook items={items} itemRender={(x) => <span>{x}</span>} />;
};
