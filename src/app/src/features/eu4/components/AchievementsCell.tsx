import { useList } from "@/hooks/useList";
import { AchievementAvatar } from "./avatars";

export const AchievementsCell = ({
  achievements,
}: {
  achievements: number[];
}) => {
  const data = useList({ data: achievements, variant: "overflow", max: 4 });

  return (
    <ul className="flex space-x-1">
      {data.items.map((x) => (
        <li className="flex" key={x}>
          <AchievementAvatar size={40} id={x} className="shrink-0" />
        </li>
      ))}
      {data.overflow.length > 0 ? (
        <li className="flex">
          <div className="h-10 w-10 place-content-center bg-neutral-950/50">
            <div className="text-center text-lg font-semibold">
              +{data.overflow.length}
            </div>
          </div>
        </li>
      ) : null}
    </ul>
  );
};
