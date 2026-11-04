import type React from "react";
import { cx } from "class-variance-authority";
import { MapHoverButton } from "../../MapHoverButton";
import { EntityName, entityLinkControl } from "../../components/EntityName";
import { usePanelNav, locationProfileEntry } from "./PanelNavContext";
import { usePanToEntity } from "../../usePanToEntity";

export type LocationTarget = { key: number; name: string };

type LocationLinkProps = {
  location: LocationTarget;
  onActivate?: (location: LocationTarget) => void;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className">;

export function LocationLink({ location, onActivate, className, ...props }: LocationLinkProps) {
  const nav = usePanelNav();
  const panToEntity = usePanToEntity();
  const activate =
    onActivate ??
    ((target: LocationTarget) => {
      nav.open(locationProfileEntry(target.key, target.name));
      panToEntity(target.key);
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
