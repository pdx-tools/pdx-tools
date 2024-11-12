import { useEu4ModList } from "../../store";

export const ModList = () => {
  const mods = useEu4ModList();
  return (
    <ul className="max-h-40 list-none overflow-auto pl-0">
      {mods
        .slice()
        .sort()
        .map((x) => (
          <li className="pr-2" key={x}>
            {x}
          </li>
        ))}
    </ul>
  );
};
