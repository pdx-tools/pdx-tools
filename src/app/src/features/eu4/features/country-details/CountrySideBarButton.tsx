import React, { useCallback, useMemo, useState } from "react";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CheckOutlined,
  QuestionCircleOutlined,
  CaretDownOutlined,
} from "@ant-design/icons";
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
  useAiCountries,
  useCountryDrawerVisible,
  useEu4Actions,
  useEu4Countries,
  useExistedAiCountries,
  useHumanCountries,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/Popover";
import { Command } from "@/components/Command";
import { EnhancedCountryInfo } from "../../types/models";
import { Link } from "@/components/Link";

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
      [selectedTag]
    )
  );

  return (
    <Sheet.Content
      ref={sideBarContainerRef}
      side="right"
      onInteractOutside={(e) => e.preventDefault()}
      className={cx(
        "flex flex-col bg-white pt-4 transition-[width] duration-200",
        expanded ? "w-full" : "w-[850px] max-w-full"
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
            {expanded ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            <span className="sr-only">{expanded ? "Fold" : "Expand"}</span>
          </Button>
          <CountrySelect />
          <Sheet modal={true}>
            <Sheet.Trigger asChild>
              <Button shape="square">
                <QuestionCircleOutlined />
                <span className="sr-only">Help</span>
              </Button>
            </Sheet.Trigger>
            <Sheet.Content side="right" className="w-96 bg-white">
              <Sheet.Header className="z-10 p-4 shadow-md">
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

      <Tabs defaultValue="General" className="flex h-full max-h-full flex-col">
        <Tabs.List className="mt-3 w-full max-w-full overflow-x-auto border-0 px-4 shadow-md">
          <Tabs.Trigger value="General">General</Tabs.Trigger>
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
        <Tabs.Content value="General" className=" flex-1 basis-0 px-4">
          {country && (
            <>
              <CountryDetailsDescriptions details={country} />
              <Divider>Diplomacy</Divider>
              <CountryDiplomacy details={country} />
            </>
          )}
        </Tabs.Content>
        <Tabs.Content value="Advisors" className=" flex-1 basis-0 px-4">
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
        <Tabs.Content value="Rulers" className=" flex-1 basis-0 px-4">
          <CountryRulersTable rulers={rulers} />
        </Tabs.Content>
        <Tabs.Content value="Leaders" className=" flex-1 basis-0 px-4">
          {country && <CountryLeaders details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Budget" className=" flex-1 basis-0 px-4">
          {country && <CountryBudget details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Mana" className=" flex-1 basis-0 px-4">
          {country && <CountryManaUsage details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Buildings" className=" flex-1 basis-0 px-4">
          {country && <CountryBuildingCount details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Religion" className=" flex-1 basis-0 px-4">
          {country && <CountryReligions details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Culture" className=" flex-1 basis-0 px-4">
          {country && <CountryCultures details={country} />}
        </Tabs.Content>
        <Tabs.Content value="States" className=" flex-1 basis-0 px-4">
          {country && <CountryStates details={country} />}
        </Tabs.Content>
        <Tabs.Content value="Estates" className=" flex-1 basis-0 px-4">
          {country && <CountryEstates details={country} />}
        </Tabs.Content>
      </Tabs>
    </Sheet.Content>
  );
};

const CountrySelect = () => {
  const [open, setOpen] = useState(false);
  const humanCountries = useHumanCountries();
  const aiCountries = useExistedAiCountries();
  const { setSelectedTag } = useEu4Actions();
  const panTag = useSideBarPanTag();
  const selectedTag = useSelectedTag();

  const countries = useEu4Countries();
  const selectedCountry = countries.find((x) => x.tag == selectedTag);

  const onSelect = useCallback(
    (tag: string) => {
      setSelectedTag(tag);
      panTag(tag);
      setOpen(false);
    },
    [setSelectedTag, panTag]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          role="combobox"
          aria-expanded={open}
          className="w-52 justify-between"
        >
          {selectedCountry
            ? `${selectedCountry.name} (${selectedCountry.tag})`
            : "unknown selection"}
          <CaretDownOutlined className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-96 w-64 overflow-auto">
        <Command>
          <Command.Input placeholder="Search countries" />
          <Command.Empty>No countries found.</Command.Empty>
          <CountrySelectGroup
            title="Players"
            countries={humanCountries}
            selected={selectedTag}
            onSelect={onSelect}
          />
          <CountrySelectGroup
            title="AI"
            countries={aiCountries}
            selected={selectedTag}
            onSelect={onSelect}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
};

type CountrySelectGroupProps = {
  title: string;
  countries: EnhancedCountryInfo[];
  onSelect: (tag: string) => void;
  selected: string;
};

const CountrySelectGroup = React.memo(function CountrySelectGroup({
  title,
  countries,
  onSelect,
  selected,
}: CountrySelectGroupProps) {
  return (
    <Command.Group heading={title}>
      {countries.map((x) => (
        <Command.Item
          key={x.tag}
          value={x.normalizedName + x.tag}
          onSelect={() => onSelect(x.tag)}
        >
          <CheckOutlined
            className={cx(
              "mr-2 h-4 w-4 opacity-0 data-[selected]:opacity-100",
              selected === x.tag ? "opacity-100" : "opacity-0"
            )}
          />
          {x.name} ({x.tag})
        </Command.Item>
      ))}
    </Command.Group>
  );
});
