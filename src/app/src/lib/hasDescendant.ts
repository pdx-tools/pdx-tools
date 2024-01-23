import React from "react";

export const hasDescendant = (
  children: React.ReactNode,
  needle: () => React.ReactElement,
): boolean => {
  let found = false;
  React.Children.forEach(children, (child) => {
    const valid = React.isValidElement(child);
    if (!valid || found) {
      return;
    }

    found ||= child.type == needle;
    found ||= hasDescendant(child.props.children, needle);
  });
  return found;
};
