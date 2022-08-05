import { Descriptions, Divider } from "antd";
import { QuickTipPayload } from "../../types/map";
import { FlagAvatar } from "../../components/avatars";
import classes from "./MapTipContents.module.css";

interface MapTipContentsProps {
  tip: QuickTipPayload;
}

const MapTipsTable = ({ tip }: MapTipContentsProps) => {
  const items = [
    <Descriptions.Item label="Owner" key="Owner">
      <FlagAvatar tag={tip.owner.tag} name={tip.owner.name} />
    </Descriptions.Item>,
    ...(tip.owner.tag != tip.controller.tag
      ? [
          <Descriptions.Item label="Controller" key="Controller">
            <FlagAvatar tag={tip.controller.tag} name={tip.controller.name} />
          </Descriptions.Item>,
        ]
      : []),
  ];

  switch (tip.kind) {
    case "political": {
      return (
        <Descriptions column={1} size="small">
          {items}
        </Descriptions>
      );
    }
    case "religion": {
      return (
        <Descriptions column={1} size="small">
          {items}
          <Descriptions.Item label="State Religion">
            {tip.stateReligion.name}
          </Descriptions.Item>
          <Descriptions.Item label="Province Religion">
            {tip.religionInProvince.name}
          </Descriptions.Item>
        </Descriptions>
      );
    }
    case "development": {
      return (
        <Descriptions column={1} size="small">
          {items}
          <Descriptions.Item
            label={`Development (${
              tip.baseManpower + tip.baseProduction + tip.baseTax
            })`}
          >
            {`${tip.baseTax} / ${tip.baseProduction} / ${tip.baseManpower}`}
          </Descriptions.Item>
        </Descriptions>
      );
    }
    case "technology": {
      return (
        <Descriptions column={1} size="small">
          {items}
          <Descriptions.Item label="Tech">
            {`${tip.admTech} / ${tip.dipTech} / ${tip.milTech}`}
          </Descriptions.Item>
        </Descriptions>
      );
    }
  }
};

export const MapTipContents = ({ tip }: MapTipContentsProps) => {
  return (
    <div
      className={`${classes["tooltip-contents"]} border-2 border-solid border-gray-300 bg-white p-4 pt-0 rounded-2xl no-break`}
    >
      <Divider orientation="left">
        {`${tip.provinceName} (${tip.provinceId})`}
      </Divider>
      <MapTipsTable tip={tip} />
    </div>
  );
};
