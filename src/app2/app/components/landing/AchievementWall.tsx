import { AchievementAvatar } from "@/features/eu4/components/avatars";
import achievementData from "@/images/eu4/achievements/achievements.json";

export function AchievementWall() {
  const data = Object.keys(achievementData);
  const slice = data.length / 3;
  const [fst, snd, thrd] = [
    data.slice(0, slice),
    data.slice(slice, -slice),
    data.slice(-slice),
  ];

  return (
    <div className="mt-4 flex h-48">
      <div className="absolute left-0 right-0">
        <div className="relative flex flex-col items-center gap-4 overflow-hidden">
          <div className="flex -translate-x-5 gap-x-10">
            {fst.map((x) => (
              <AchievementAvatar
                className="opacity-70 grayscale transition-opacity hover:opacity-100 hover:grayscale-0"
                key={x}
                id={x}
                size={40}
              />
            ))}
          </div>
          <div className="flex -translate-x-[60px] gap-x-10">
            {snd.map((x) => (
              <AchievementAvatar
                className="opacity-70 grayscale transition-opacity hover:opacity-100 hover:grayscale-0"
                key={x}
                id={x}
                size={40}
              />
            ))}
          </div>
          <div className="flex -translate-x-5 gap-x-10">
            {thrd.map((x) => (
              <AchievementAvatar
                className="opacity-70 grayscale transition-opacity hover:opacity-100 hover:grayscale-0"
                key={x}
                id={x}
                size={40}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
