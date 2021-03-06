import { Descriptions, Divider } from "antd";
import { QuickTipPayload } from "../../types/map";
import { FlagAvatar } from "../../components/avatars";

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
    <div className="tooltip-contents no-break">
      <Divider orientation="left" style={{ margin: 0 }}>
        {`${tip.provinceName} (${tip.provinceId})`}
      </Divider>
      <MapTipsTable tip={tip} />

      <style jsx>{`
        .tooltip-contents {
          background-color: white;
          padding: 1rem;
          border-radius: 1rem;
          border: 1px #ccc solid;
        }

        .tooltip-contents :global(.ant-descriptions-view > table) {
          width: max-content;
        }
      `}</style>
    </div>
  );
};
