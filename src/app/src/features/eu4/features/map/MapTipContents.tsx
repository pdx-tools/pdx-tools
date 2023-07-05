import { Descriptions } from "antd";
import { QuickTipPayload } from "../../types/map";
import { FlagAvatarCore } from "../../components/avatars";
import classes from "./MapTipContents.module.css";
import { formatInt } from "@/lib/format";
import { LocalizedTag } from "../../types/models";

interface MapTipContentsProps {
  tip: QuickTipPayload;
}

interface MapTipFlagProps {
  tag: string;
  name: string;
}

const MapTipFlag = ({ tag, name }: MapTipFlagProps) => {
  return (
    <div className="flex gap-1 text-start">
      <FlagAvatarCore tag={tag} />
      <span>
        {name} ({tag})
      </span>
    </div>
  );
};

const mapTagDescriptions = ({
  owner,
  controller,
}: {
  owner: LocalizedTag;
  controller: LocalizedTag;
}) => {
  const controllerItem =
    owner.tag != controller.tag ? (
      <Descriptions.Item label="Controller" key="Controller">
        <MapTipFlag tag={controller.tag} name={controller.name} />
      </Descriptions.Item>
    ) : null;

  return [
    <Descriptions.Item label="Owner" key="Owner">
      <MapTipFlag tag={owner.tag} name={owner.name} />
    </Descriptions.Item>,
    controllerItem,
  ];
};

const MapTipsTable = ({ tip }: MapTipContentsProps) => {
  const items: React.ReactNode[] = [];
  switch (tip.kind) {
    case "political": {
      return (
        <Descriptions column={1} size="small">
          {mapTagDescriptions(tip)}
        </Descriptions>
      );
    }
    case "religion": {
      return (
        <Descriptions column={1} size="small">
          {mapTagDescriptions(tip)}
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
          {mapTagDescriptions(tip)}
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
    case "battles": {
      return (
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Battles">
            {formatInt(tip.battles)}
          </Descriptions.Item>
          <Descriptions.Item label="Casualties">
            {formatInt(tip.losses)}
          </Descriptions.Item>
        </Descriptions>
      );
    }
    case "technology": {
      return (
        <Descriptions column={1} size="small">
          {mapTagDescriptions(tip)}
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
      className={`${classes["tooltip-contents"]} no-break rounded-2xl border-2 border-solid border-gray-300 bg-white p-4`}
    >
      <div className="mb-2 text-lg">{`${tip.provinceName} (${tip.provinceId})`}</div>
      <MapTipsTable tip={tip} />
    </div>
  );
};
