import React, { useCallback, useState } from "react";
import {
  SideBarButton,
  SideBarButtonProps,
} from "@/features/eu4/components/SideBarButton";
import { VisualizationProvider } from "@/components/viz/visualization-context";
import {
  SideBarContainerProvider,
  useSideBarContainerRef,
} from "../../components/SideBarContainer";
import { Sheet } from "@/components/Sheet";
import {
  useCountryDrawerVisible,
  useEu4Actions,
  useEu4Countries,
  useSelectedTag,
} from "../../store";
import { useSideBarPanTag } from "../../hooks/useSideBarPanTag";
import { useEu4Worker } from "../../worker";
import { cx } from "class-variance-authority";
import { Button } from "@/components/Button";
import { FinancialHelp } from "../charts/FinancialHelp";
import { Divider } from "@/components/Divider";
import { GreatAdvisorsList } from "./GreatAdvisorsList";
import { CountryDetailsDescriptions } from "./CountryDetailsDescriptions";
import { CountryDiplomacy } from "./CountryDiplomacy";
import { CountryRulersTable } from "./CountryRulersTable";
import { CountryLeaders } from "./CountryLeaders";
import { CountryBudget } from "./CountryBudget";
import { CountryManaUsage } from "./CountryManaUsage";
import { CountryReligions } from "./CountryReligions";
import { CountryCultures } from "./CountryCultures";
import { CountryStates } from "./CountryStates";
import { CountryBuildingCount } from "./CountryBuildingCount";
import { CountryEstates } from "./CountryEstates";
import { Tabs } from "@/components/Tabs";
import { Alert } from "@/components/Alert";
import { Link } from "@/components/Link";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { MenuUnfoldIcon } from "@/components/icons/MenuUnfoldIcon";
import { MenuFoldIcon } from "@/components/icons/MenuFoldIcon";
import { CountrySelect } from "../../components/CountrySelect";
import { emitEvent } from "@/lib/events";
import { CountryHistory } from "./CountryHistory";
import { CountryInstitution } from "./CountryInstitution";
import { ActiveWarCard } from "./ActiveWarCard";

export const CountrySideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const visible = useCountryDrawerVisible();
  const { setCountryDrawer } = useEu4Actions();
  return (
    <Sheet modal={false} open={visible} onOpenChange={setCountryDrawer}>
      <Sheet.Trigger asChild>
        <SideBarButton {...props}>{children}</SideBarButton>
      </Sheet.Trigger>

      <VisualizationProvider>
        <SideBarContainerProvider>
          <CountryDetailsContent />
        </SideBarContainerProvider>
      </VisualizationProvider>
    </Sheet>
  );
};

const CountryDetailsContent = () => {
  const [expanded, setExpanded] = useState(false);
  const selectedTag = useSelectedTag();
  const sideBarContainerRef = useSideBarContainerRef();

  const {
    data: [country, rulers, advisors] = [undefined, [], undefined],
    error,
  } = useEu4Worker(
    useCallback(
      (worker) =>
        Promise.all([
          worker.eu4GetCountry(selectedTag),
          worker.eu4GetCountryRulers(selectedTag),
          worker.eu4GetCountryAdvisors(selectedTag),
        ]),
      [selectedTag],
    ),
  );

  return (
    <Sheet.Content
      ref={sideBarContainerRef}
      side="right"
      onInteractOutside={(e) => e.preventDefault()}
      className={cx(
        "flex flex-col bg-white pt-4 transition-[width] duration-200 dark:bg-slate-900",
        expanded ? "w-full" : "w-[970px] max-w-full",
      )}
    >
      <Sheet.Header className="px-4">
        <div className="flex items-center gap-2">
          <Sheet.Close />
          <Button
            shape="square"
            onClick={() => setExpanded(!expanded)}
            className="hidden md:flex"
          >
            {expanded ? (
              <MenuUnfoldIcon className="h-4 w-4" />
            ) : (
              <MenuFoldIcon className="h-4 w-4" />
            )}
            <span className="sr-only">{expanded ? "Fold" : "Expand"}</span>
          </Button>
          <CountryViewSelect />
          <Sheet modal={true}>
            <Sheet.Trigger asChild>
              <Button shape="square">
                <QuestionMarkCircleIcon className="h-4 w-4" />
                <span className="sr-only">Help</span>
              </Button>
            </Sheet.Trigger>
            <Sheet.Content
              side="right"
              className="w-96 bg-white dark:bg-slate-900"
            >
              <Sheet.Header className="z-10 items-center p-4 shadow-md">
                <Sheet.Close />
                <Sheet.Title>Help</Sheet.Title>
              </Sheet.Header>
              <Sheet.Body className="flex flex-col gap-2 px-4 pt-6">
                <p>Some mana actions are not recorded in the save:</p>
                <ul className="space-y-2">
                  <li>
                    Diplo mana gained from cancelling culture conversion. The
                    game only records the expenditure and not the refund. If one
                    takes this to the extreme, it can look like a country had
                    infinite diplo mana, where in reality it was a players
                    repeatedly cancelling culture conversions as a form of diplo
                    banking.
                  </li>
                  <li>Diplo mana spent on diplo annexing</li>
                  <li>Diplo mana lost due to too many relations</li>
                </ul>
                <p>
                  The reason why countries who have re-elected rulers contain
                  inaccurate calculations is that the election event is not
                  stored in the save, so when PDX Tools sees a ruler is 6 / 6 /
                  6, it is unsure how many elections have occurred and when they
                  might have occurred, as some government reforms change the
                  frequency of elections. Thus for calculation purposes,
                  elections are ignored and it is assumed that the ruler was
                  always 6 / 6 / 6. This phenomenon is also observable due to
                  events or missions that increase ruler stats.
                </p>
                <FinancialHelp />
              </Sheet.Body>
            </Sheet.Content>
          </Sheet>
        </div>
      </Sheet.Header>
      {error ? (
        <div className="flex px-4">
          <Alert.Error msg={error} className="m-2 p-2" />
        </div>
      ) : null}

      <Tabs
        defaultValue="General"
        className="flex h-full max-h-full flex-col"
        onValueChange={(section) => {
          emitEvent({ kind: "Country details tab change", section });
        }}
      >
        <Tabs.List className="mt-3 w-full max-w-full overflow-x-auto border-0 px-4 shadow-md">
          <Tabs.Trigger value="General">General</Tabs.Trigger>
          <Tabs.Trigger value="History">History</Tabs.Trigger>
          <Tabs.Trigger value="Institution">Institution</Tabs.Trigger>
          <Tabs.Trigger value="Advisors">Advisors</Tabs.Trigger>
          <Tabs.Trigger value="Rulers">Rulers</Tabs.Trigger>
          <Tabs.Trigger value="Leaders">Leaders</Tabs.Trigger>
          <Tabs.Trigger value="Budget">Budget</Tabs.Trigger>
          <Tabs.Trigger value="Mana">Mana</Tabs.Trigger>
          <Tabs.Trigger value="Buildings">Buildings</Tabs.Trigger>
          <Tabs.Trigger value="Religion">Religion</Tabs.Trigger>
          <Tabs.Trigger value="Culture">Culture</Tabs.Trigger>
          <Tabs.Trigger value="States">States</Tabs.Trigger>
          <Tabs.Trigger value="Estates">Estates</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="General" className="flex-1 basis-0 px-4 py-6">
          {country && (
            <>
              <CountryDetailsDescriptions details={country} />
              {country.active_wars.length > 0 ? (
                <>
                  <Divider>Ongoing Wars</Divider>
                  <div className="flex flex-col gap-8">
                    {country.active_wars.map((x) => (
                      <ActiveWarCard key={x.name} war={x} />
                    ))}
                  </div>
                </>
              ) : null}
              <Divider>Diplomacy</Divider>
              <CountryDiplomacy details={country} />
            </>
          )}
        </Tabs.Content>
        <Tabs.Content value="History" className="relative flex-1 basis-0">
          {country && <CountryHistory details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Institution" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryInstitution details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Advisors" className="flex-1 basis-0 px-4 py-6">
          <div>
            Radical reforms completed: {advisors?.radicalReforms || "no"}
          </div>
          <Divider>
            One Time Advisor Events (
            <Link
              target="_blank"
              href="/docs/eu4-guides/one-time-advisor-events/"
            >
              guide
            </Link>
            )
          </Divider>
          {advisors?.greatAdvisors && (
            <GreatAdvisorsList greatAdvisors={advisors.greatAdvisors} />
          )}
        </Tabs.Content>
        <Tabs.Content value="Rulers" className="flex-1 basis-0 px-4 py-6">
          <CountryRulersTable rulers={rulers} />
        </Tabs.Content>
        <Tabs.Content value="Leaders" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryLeaders details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Budget" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryBudget details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Mana" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryManaUsage details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Buildings" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryBuildingCount details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Religion" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryReligions details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Culture" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryCultures details={country} />}
        </Tabs.Content>
        <Tabs.Content value="States" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryStates details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Estates" className="flex-1 basis-0 px-4 py-6">
          {country && <CountryEstates details={country} />}
        </Tabs.Content>
      </Tabs>
    </Sheet.Content>
  );
};

const CountryViewSelect = () => {
  const { setSelectedTag } = useEu4Actions();
  const panTag = useSideBarPanTag();
  const selectedTag = useSelectedTag();
  const countries = useEu4Countries();
  const selectedCountry = countries.find((x) => x.tag == selectedTag);

  const onSelect = useCallback(
    (tag: string): boolean => {
      setSelectedTag(tag);
      panTag(tag);
      return false;
    },
    [setSelectedTag, panTag],
  );

  const isSelected = useCallback(
    (tag: string): boolean => tag == selectedTag,
    [selectedTag],
  );

  return (
    <CountrySelect isSelected={isSelected} onSelect={onSelect}>
      {selectedCountry
        ? `${selectedCountry.name} (${selectedCountry.tag})`
        : "unknown selection"}
    </CountrySelect>
  );
};
