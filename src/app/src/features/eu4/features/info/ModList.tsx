import { useEu4ModList } from "@/features/eu4/eu4Slice";

export const ModList = () => {
  const mods = useEu4ModList();
  return (
    <ul>
      {mods
        .slice()
        .sort()
        .map((x) => (
          <li key={x}>{x}</li>
        ))}
      <style jsx>{`
        ul {
          max-height: 120px;
          overflow: auto;
          padding-left: 0;
        }

        li {
          list-style: none;
        }
      `}</style>
    </ul>
  );
};
