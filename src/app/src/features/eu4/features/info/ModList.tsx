import { useEu4ModList } from "../../store";

export const ModList = () => {
  const mods = useEu4ModList();
  return (
    <ul className="max-h-28 list-none overflow-auto pl-0">
      {mods
        .slice()
        .sort()
        .map((x) => (
          <li key={x}>{x}</li>
        ))}
    </ul>
  );
};
