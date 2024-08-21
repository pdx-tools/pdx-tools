import { QuickTipPayload } from "../../types/map";
import { Flag } from "../../components/avatars";
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
    <div className="flex items-center gap-1">
      <Flag tag={tag} name={name}>
        <Flag.Image />
      </Flag>
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
  return (
    <>
      {owner.tag != controller.tag ? (
        <tr>
          <td>Controller:</td>
          <td className="pl-2">
            <MapTipFlag tag={controller.tag} name={controller.name} />
          </td>
        </tr>
      ) : null}

      <tr>
        <td>Owner:</td>
        <td className="pl-2">
          <MapTipFlag tag={owner.tag} name={owner.name} />
        </td>
      </tr>
    </>
  );
};

const MapTipsTable = ({ tip }: MapTipContentsProps) => {
  switch (tip.kind) {
    case "political": {
      return (
        <table>
          <tbody>{mapTagDescriptions(tip)}</tbody>
        </table>
      );
    }
    case "religion": {
      return (
        <table>
          <tbody>
            {mapTagDescriptions(tip)}
            <tr>
              <td>{tip.owner.name}:</td>
              <td className="pl-2">{tip.stateReligion.name}</td>
            </tr>
            <tr>
              <td>Province:</td>
              <td className="pl-2">{tip.religionInProvince.name}</td>
            </tr>
          </tbody>
        </table>
      );
    }
    case "development": {
      return (
        <table>
          <tbody>
            {mapTagDescriptions(tip)}
            <tr>
              <td>
                Development (
                {tip.baseManpower + tip.baseProduction + tip.baseTax}):
              </td>
              <td className="pl-2">
                {tip.baseTax} / {tip.baseProduction} / {tip.baseManpower}
              </td>
            </tr>
          </tbody>
        </table>
      );
    }
    case "battles": {
      return (
        <table>
          <tbody>
            <tr>
              <td>Battles:</td>
              <td className="pl-2">{formatInt(tip.battles)}</td>
            </tr>
            <tr>
              <td>Losses:</td>
              <td className="pl-2">{formatInt(tip.losses)}</td>
            </tr>
          </tbody>
        </table>
      );
    }
    case "technology": {
      return (
        <table>
          <tbody>
            {mapTagDescriptions(tip)}
            <tr>
              <td>Tech:</td>
              <td className="pl-2">
                {tip.admTech} / {tip.dipTech} / {tip.milTech}
              </td>
            </tr>
          </tbody>
        </table>
      );
    }
  }
};

export const MapTipContents = ({ tip }: MapTipContentsProps) => {
  return (
    <div
      className={`no-break rounded-2xl border-2 border-solid border-gray-300 bg-white p-4 shadow-lg dark:border-gray-600 dark:bg-slate-900`}
    >
      <div className="mb-2 text-lg">{`${tip.provinceName} (${tip.provinceId})`}</div>
      <MapTipsTable tip={tip} />
    </div>
  );
};
