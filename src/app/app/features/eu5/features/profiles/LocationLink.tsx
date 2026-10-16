import type React from "react";
import { cx } from "class-variance-authority";
import { MapHoverButton } from "../../MapHoverButton";
import { EntityName, entityLinkControl } from "../../components/EntityName";
import { useAnalysisEntityNavigation } from "./useAnalysisEntityNavigation";

export type LocationTarget = { key: number; name: string };

type LocationLinkProps = {
  location: LocationTarget;
  backLabel?: string;
  onActivate?: (location: LocationTarget) => void;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className">;

export function LocationLink({
  location,
  backLabel,
  onActivate,
  className,
  ...props
}: LocationLinkProps) {
  const openEntity = useAnalysisEntityNavigation();
  const activate =
    onActivate ??
    ((target: LocationTarget) => {
      void openEntity("location", target.key, target.name, target.key, backLabel);
    });

  return (
    <MapHoverButton
      {...props}
      target={{ kind: "location", locationIdx: location.key }}
      className={cx(entityLinkControl, "min-w-0 text-left", className)}
      onClick={() => activate(location)}
    >
      <EntityName className="block min-w-0 truncate">{location.name}</EntityName>
    </MapHoverButton>
  );
}
