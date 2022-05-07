import React from "react";
import { GreatAdvisor } from "../../types/models";
import { AdvisorAvatar } from "@/features/eu4/components/avatars";

interface GreatAdvisorsListProps {
  greatAdvisors: GreatAdvisor[];
}

export const GreatAdvisorsList = ({
  greatAdvisors,
}: GreatAdvisorsListProps) => {
  return (
    <div className="container">
      <style jsx>{`
        .container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          column-gap: 1rem;
          row-gap: 0.25rem;
        }
      `}</style>
      {greatAdvisors.map((x) => {
        return (
          <AdvisorAvatar
            key={x.occupation.id}
            enabled={!!x.trigger_date}
            localized={x.occupation}
            triggerDate={x.trigger_date}
          />
        );
      })}
    </div>
  );
};
