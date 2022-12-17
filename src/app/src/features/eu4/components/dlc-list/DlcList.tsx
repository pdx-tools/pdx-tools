import React from "react";
import { Tooltip } from "antd";
import Image from "next/image";

const dlc = [
  [10, "Conquest of Paradise", require("./dlc-images/10_s.png")],
  [18, "Wealth of Nations", require("./dlc-images/18_s.png")],
  [21, "Res Publica", require("./dlc-images/21_s.png")],
  [27, "Art of War", require("./dlc-images/27_s.png")],
  [33, "El Dorado", require("./dlc-images/33_s.png")],
  [39, "Common Sense", require("./dlc-images/39_s.png")],
  [46, "The Cossacks", require("./dlc-images/46_s.png")],
  [55, "Mare Nostrum", require("./dlc-images/55_s.png")],
  [60, "Rights of Man", require("./dlc-images/60_s.png")],
  [66, "Mandate of Heaven", require("./dlc-images/66_s.png")],
  [72, "Third Rome", require("./dlc-images/72_s.png")],
  [77, "Cradle of Civilization", require("./dlc-images/77_s.png")],
  [84, "Rule Britannia", require("./dlc-images/84_s.png")],
  [90, "Dharma", require("./dlc-images/90_s.png")],
  [95, "Golden Century", require("./dlc-images/95_s.png")],
  [101, "Emperor", require("./dlc-images/101_s.png")],
  [106, "Leviathan", require("./dlc-images/106_s.png")],
  [110, "Origins", require("./dlc-images/110_s.png")],
  [115, "Lions of the North", require("./dlc-images/115_s.png")],
];

interface DlcListProps {
  dlc_enabled: number[];
}

export const DlcList = ({ dlc_enabled }: DlcListProps) => {
  const list = dlc.map(([id, name, imgPath]) => {
    const disabled = dlc_enabled.find((x) => x === id) === undefined;
    return (
      <Tooltip key={id} title={name}>
        <span style={disabled ? { filter: "grayscale(1)" } : undefined}>
          <Image alt={`${name} icon`} src={imgPath} />
        </span>
      </Tooltip>
    );
  });

  return <div>{list}</div>;
};
