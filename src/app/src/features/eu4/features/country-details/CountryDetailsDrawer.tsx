import React, { useCallback, useEffect, useState } from "react";
import { Button, Divider, Drawer, Grid, Tabs } from "antd";
import { useDispatch, useSelector } from "react-redux";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import {
  selectEu4SelectedTag,
  setEu4SelectedTag,
} from "@/features/eu4/eu4Slice";
import { useWorkerOnSave, WorkerClient } from "@/features/engine";
import {
  CountryDetails,
  GreatAdvisor,
  RunningMonarch,
} from "../../types/models";
import { FinancialHelp } from "../charts/FinancialHelp";
import { CountryBudget } from "./CountryBudget";
import { CountryBuildingCount } from "./CountryBuildingCount";
import { CountryDetailsDescriptions } from "./CountryDetailsDescriptions";
import { CountryManaUsage } from "./CountryManaUsage";
import { CountryReligions } from "./CountryReligions";
import { CountryRulersTable } from "./CountryRulersTable";
import { GreatAdvisorsList } from "./GreatAdvisorsList";
import { CountrySelect } from "../../components/country-select";
import { usePanTag } from "../../hooks/usePanTag";
import { useSideBarContainerRef } from "../../components/SideBarContainer";
import { CountryLeaders } from "./CountryLeaders";

const { TabPane } = Tabs;
const { useBreakpoint } = Grid;

interface CountryDetailsProps {
  visible: boolean;
  closeDrawer: () => void;
}

export const CountryDetailsDrawer: React.FC<CountryDetailsProps> = ({
  visible,
  closeDrawer,
}) => {
  const { md } = useBreakpoint();
  const [expanded, setExpanded] = useState(false);
  const selectedTag = useSelector(selectEu4SelectedTag);
  const dispatch = useDispatch();
  const [helpVisible, setHelpVisible] = useState(false);
  const [country, setCountry] = useState<CountryDetails>();
  const [rulers, setRulers] = useState<RunningMonarch[]>([]);
  const [greatAdvisors, setGreatAdvisors] = useState<GreatAdvisor[]>([]);
  const sideBarContainerRef = useSideBarContainerRef();
  const panTag = usePanTag();

  const cb = useCallback(
    async (worker: WorkerClient) => {
      const country = worker.eu4GetCountry(selectedTag);
      const rulers = worker.eu4GetCountryRulers(selectedTag);
      const greatAdvisors = worker.eu4GetCountryGreatAdvisors(selectedTag);

      setCountry(await country);
      setRulers(await rulers);
      setGreatAdvisors(await greatAdvisors);
    },
    [selectedTag]
  );

  useWorkerOnSave(cb);

  return (
    <Drawer
      visible={visible}
      closable={true}
      mask={false}
      push={false}
      maskClosable={false}
      onClose={closeDrawer}
      width={!expanded ? "min(800px, 100%)" : "100%"}
      title={
        <div className="flex-row gap">
          {md && (
            <Button
              icon={expanded ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setExpanded(!expanded)}
            />
          )}

          <CountrySelect
            value={selectedTag}
            style={{ width: "250px" }}
            onChange={(x: any) => {
              dispatch(setEu4SelectedTag(x as string));
              panTag(x as string);
            }}
          />

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
            {country && <CountryDetailsDescriptions details={country} />}
          </TabPane>
          <TabPane tab="Advisors" key="Advisors">
            <Divider orientation="left">One Time Advisor Events</Divider>
            <GreatAdvisorsList greatAdvisors={greatAdvisors} />
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
        </Tabs>
      </div>
    </Drawer>
  );
};
