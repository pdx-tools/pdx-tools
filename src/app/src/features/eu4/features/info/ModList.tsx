import { useEu4ModList } from "@/features/eu4/eu4Slice";

export const ModList = () => {
  const mods = useEu4ModList();
  return (
    <ul className="list-none pl-0 overflow-auto max-h-28">
      {mods
        .slice()
        .sort()
        .map((x) => (
          <li key={x}>{x}</li>
        ))}
    </ul>
  );
};
