import React, { useCallback, useState } from "react";
import { Button, Divider, Drawer, Grid, Tabs, Tooltip } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  ZoomInOutlined,
} from "@ant-design/icons";
import { FinancialHelp } from "../charts/FinancialHelp";
import { CountryBudget } from "./CountryBudget";
import { CountryBuildingCount } from "./CountryBuildingCount";
import { CountryDetailsDescriptions } from "./CountryDetailsDescriptions";
import { CountryManaUsage } from "./CountryManaUsage";
import { CountryReligions } from "./CountryReligions";
import { CountryRulersTable } from "./CountryRulersTable";
import { GreatAdvisorsList } from "./GreatAdvisorsList";
import { CountrySelect } from "../../components/country-select";
import {
  closeDrawerPropagation,
  useSideBarContainerRef,
} from "../../components/SideBarContainer";
import { CountryLeaders } from "./CountryLeaders";
import { CountryCultures } from "./CountryCultures";
import { CountryDiplomacy } from "./CountryDiplomacy";
import { CountryStates } from "./CountryStates";
import { useEu4Worker } from "@/features/eu4/worker";
import { useSideBarPanTag } from "../../hooks/useSideBarPanTag";
import {
  useCountryDrawerVisible,
  useEu4Actions,
  useSelectedTag,
} from "../../store";

const { TabPane } = Tabs;
const { useBreakpoint } = Grid;

export const CountryDetailsDrawer = () => {
  const { md } = useBreakpoint();
  const [expanded, setExpanded] = useState(false);
  const selectedTag = useSelectedTag();
  const visible = useCountryDrawerVisible();
  const { setSelectedTag, closeCountryDrawer } = useEu4Actions();
  const [helpVisible, setHelpVisible] = useState(false);
  const sideBarContainerRef = useSideBarContainerRef();
  const panTag = useSideBarPanTag();

  const { data: [country, rulers, advisors] = [undefined, [], undefined] } =
    useEu4Worker(
      useCallback(
        (worker) =>
          Promise.all([
            worker.eu4GetCountry(selectedTag),
            worker.eu4GetCountryRulers(selectedTag),
            worker.eu4GetCountryAdvisors(selectedTag),
          ]),
        [selectedTag]
      )
    );

  return (
    <Drawer
      visible={visible}
      closable={true}
      mask={false}
      push={false}
      maskClosable={false}
      onClose={closeDrawerPropagation(closeCountryDrawer, visible)}
      width={!expanded ? "min(800px, 100%)" : "100%"}
      title={
        <div className="flex items-center gap-2">
          {md && (
            <Button
              icon={expanded ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setExpanded(!expanded)}
            />
          )}

          <CountrySelect
            ai="all"
            value={selectedTag}
            className="w-64"
            onChange={(x: any) => {
              setSelectedTag(x as string);
              panTag(x as string);
            }}
          />

          <Tooltip title="Zoom and pan map to country">
            <Button
              onClick={() => panTag(selectedTag)}
              icon={<ZoomInOutlined />}
            />
          </Tooltip>

          <Button
            onClick={() => setHelpVisible(true)}
            icon={<QuestionCircleOutlined />}
          />
        </div>
      }
    >
      <Drawer
        width="min(500px, 100%)"
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
      >
        <p>Some mana actions are not recorded in the save:</p>
        <ul>
          <li>
            Diplo mana gained from cancelling culture conversion. The game only
            records the expenditure and not the refund. If one takes this to the
            extreme, it can look like a country had infinite diplo mana, where
            in reality it was a players repeatedly cancelling culture
            conversions as a form of diplo banking.
          </li>
          <li>Diplo mana spent on diplo annexing</li>
          <li>Diplo mana lost due to too many relations</li>
        </ul>
        <p>
          The reason why countries who have re-elected rulers contain inaccurate
          calculations is that the election event is not stored in the save, so
          when PDX Tools sees a ruler is 6 / 6 / 6, it is unsure how many
          elections have occurred and when they might have occurred, as some
          government reforms change the frequency of elections. Thus for
          calculation purposes, elections are ignored and it is assumed that the
          ruler was always 6 / 6 / 6. This phenomenon is also observable due to
          events or missions that increase ruler stats.
        </p>
        <FinancialHelp />
      </Drawer>

      <div ref={sideBarContainerRef}>
        <Tabs defaultActiveKey="1">
          <TabPane tab="General" key="General">
            {country && (
              <>
                <CountryDetailsDescriptions details={country} />
                <Divider orientation="left">Diplomacy</Divider>
                <CountryDiplomacy details={country} />
              </>
            )}
          </TabPane>
          <TabPane tab="Advisors" key="Advisors">
            <div>
              Radical reforms completed: {advisors?.radicalReforms || "no"}
            </div>
            <Divider orientation="left">
              One Time Advisor Events (
              <a
                target="_blank"
                href="/docs/eu4-guides/one-time-advisor-events/"
              >
                guide
              </a>
              )
            </Divider>
            {advisors?.greatAdvisors && (
              <GreatAdvisorsList greatAdvisors={advisors.greatAdvisors} />
            )}
          </TabPane>
          <TabPane tab="Rulers" key="Rulers">
            <Divider orientation="left">Past Rulers and Failed Heirs</Divider>
            <CountryRulersTable rulers={rulers} />
          </TabPane>
          <TabPane tab="Leaders" key="Leaders">
            {country && <CountryLeaders details={country} />}
          </TabPane>
          <TabPane tab="Budget" key="Budget">
            {country && <CountryBudget details={country} />}
          </TabPane>
          <TabPane tab="Mana" key="Mana">
            {country && <CountryManaUsage details={country} />}
          </TabPane>
          <TabPane tab="Buildings" key="Buildings">
            {country && <CountryBuildingCount details={country} />}
          </TabPane>
          <TabPane tab="Religion" key="Religion">
            {country && <CountryReligions details={country} />}
          </TabPane>
          <TabPane tab="Culture" key="Culture">
            {country && <CountryCultures details={country} />}
          </TabPane>
          <TabPane tab="States" key="States">
            {country && <CountryStates details={country} />}
          </TabPane>
        </Tabs>
      </div>
    </Drawer>
  );
};
