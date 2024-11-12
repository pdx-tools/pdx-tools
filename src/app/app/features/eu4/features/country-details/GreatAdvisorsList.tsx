import React from "react";
import { GreatAdvisor } from "../../types/models";
import { AdvisorAvatar } from "@/features/eu4/components/avatars";
import classes from "./GreatAdvisorsList.module.css";

interface GreatAdvisorsListProps {
  greatAdvisors: GreatAdvisor[];
}

export const GreatAdvisorsList = ({
  greatAdvisors,
}: GreatAdvisorsListProps) => {
  return (
    <div className={`grid gap-x-4 gap-y-1 ${classes.table}`}>
      {greatAdvisors.map((x) => {
        return (
          <AdvisorAvatar
            key={x.occupation.id}
            enabled={!!x.triggerDate}
            localized={x.occupation}
            triggerDate={x.triggerDate}
          />
        );
      })}
    </div>
  );
};
