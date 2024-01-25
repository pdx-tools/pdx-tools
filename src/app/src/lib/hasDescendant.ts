import React from "react";

/// Returns true if any children or further
/// descendants contains a given component.
export const hasDescendant = (
  children: React.ReactNode,
  needle: (...args: any[]) => React.ReactNode
): boolean => {
  let found = false;
  React.Children.forEach(children, (child) => {
    const valid = React.isValidElement(child);
    if (!valid || found) {
      return;
    }

    found ||= child.type == needle;
    if (!found) {
      found ||= hasDescendant(child.props.children, needle);
    }
  });
  return found;
};
