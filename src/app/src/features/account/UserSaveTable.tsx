import React, { useMemo } from "react";
import { TimeAgo } from "@/components/TimeAgo";
import { SaveFile } from "@/services/appApi";
import { diff } from "@/lib/dates";
import { difficultyText } from "@/lib/difficulty";
import { DeleteSave } from "../eu4/components/DeleteSave";
import { AchievementAvatar, Flag } from "@/features/eu4/components/avatars";
import { groupBy } from "@/lib/groupBy";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/DataTable";
import { Link } from "@/components/Link";

interface UserSaveTableProps {
  saves: SaveFile[];
  isPrivileged: boolean;
}

type SaveRow = SaveFile & {
  name: string;
  rowSpan: number;
};

const columnHelper = createColumnHelper<SaveRow>();

export const UserSaveTable = ({ saves, isPrivileged }: UserSaveTableProps) => {
  const data = useMemo(() => {
    const fileGroup = groupBy(saves, (x) => x.filename);

    // File names that map to one playthrough id
    const elgibleFilenames = [...fileGroup.entries()].flatMap(
      ([filename, saves]) => {
        const playthroughIds = new Set(saves.map((x) => x.playthrough_id));
        return playthroughIds.size === 1 ? [filename] : [];
      },
    );
    const uniqnames = new Set(elgibleFilenames);

    const groups = groupBy(saves, (x) => x.playthrough_id);
    const playthroughs = [...groups.entries()].map(([group, saves]) => {
      // Check if all grouped saves have the same filename
      const filenames = new Set(saves.map((x) => x.filename));
      const allSameName = filenames.size === 1;
      const filename = saves[0].filename;

      // Playthrough name: if all saves in the group have the same name
      // then use the filename unless other saves outside the group also
      // share the same name.
      const name =
        allSameName && uniqnames.has(filename)
          ? filename
          : playthroughName(group);

      saves.sort((a, b) => b.days - a.days);
      return saves.map((x, i) => ({
        ...x,
        name,
        rowSpan: i == 0 ? saves.length : 0,
      }));
    });

    playthroughs.sort((a, b) => -diff(a[0].upload_time, b[0].upload_time));

    return playthroughs.flat();
  }, [saves]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Playthrough",
      }),

      columnHelper.accessor("upload_time", {
        cell: (info) => <TimeAgo date={info.getValue()} />,
        header: "Uploaded",
      }),

      columnHelper.accessor("days", {
        header: "Date",
        cell: (info) => (
          <div className="no-break">{info.row.original.date}</div>
        ),
      }),

      columnHelper.accessor("player_start_tag_name", {
        header: "Starting",
        cell: ({ row }) =>
          row.original.player_start_tag &&
          row.original.player_start_tag_name ? (
            <Flag
              tag={row.original.player_start_tag}
              name={row.original.player_start_tag_name}
            />
          ) : (
            "Multiplayer"
          ),
      }),
      columnHelper.accessor("player_tag_name", {
        header: "Current",
        cell: ({ row }) => (
          <Flag
            tag={row.original.player_tag}
            name={row.original.player_tag_name}
          />
        ),
      }),
      columnHelper.accessor("patch", {
        header: "Patch",
      }),
      columnHelper.accessor("game_difficulty", {
        header: "Difficulty",
        cell: (info) => difficultyText(info.getValue()),
      }),
      columnHelper.display({
        header: "Achievements",
        cell: (info) => (
          <ul className="flex space-x-1">
            {info.row.original.achievements.map((x) => (
              <li className="flex" key={x}>
                <AchievementAvatar id={x} size={40} className="shrink-0" />
              </li>
            ))}
          </ul>
        ),
      }),
      columnHelper.display({
        id: "actions",
        cell: (info) => {
          const data = info.row.original;
          const link = <Link href={`/eu4/saves/${data.id}`}>View</Link>;
          let deleteEle = null;
          if (isPrivileged) {
            deleteEle = (
              <DeleteSave
                variant="ghost"
                className="text-rose-500 underline-offset-4 hover:underline"
                saveId={data.id}
              />
            );
          }

          return (
            <div className="flex items-center space-x-2">
              {link}
              {deleteEle}
            </div>
          );
        },
      }),
    ],
    [isPrivileged],
  );

  return <DataTable columns={columns} data={data} />;
};

function playthroughName(playthroughId: string) {
  const start = playthroughId.slice(0, Math.floor(playthroughId.length / 2));
  const end = playthroughId.slice(Math.floor(playthroughId.length / 2));
  return `${nameHash(start, left)} ${nameHash(end, right)}`;
}

/// https://stackoverflow.com/a/8831937
function nameHash(str: string, names: string[]) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return names[Math.abs(hash) % names.length];
}

const left = [
  "admiring",
  "adoring",
  "affectionate",
  "agitated",
  "amazing",
  "angry",
  "awesome",
  "beautiful",
  "blissful",
  "bold",
  "boring",
  "brave",
  "busy",
  "charming",
  "clever",
  "compassionate",
  "competent",
  "condescending",
  "confident",
  "cool",
  "cranky",
  "crazy",
  "dazzling",
  "determined",
  "distracted",
  "dreamy",
  "eager",
  "ecstatic",
  "elastic",
  "elated",
  "elegant",
  "eloquent",
  "epic",
  "exciting",
  "fervent",
  "festive",
  "flamboyant",
  "focused",
  "friendly",
  "frosty",
  "funny",
  "gallant",
  "gifted",
  "goofy",
  "gracious",
  "great",
  "happy",
  "hardcore",
  "heuristic",
  "hopeful",
  "hungry",
  "infallible",
  "inspiring",
  "intelligent",
  "interesting",
  "jolly",
  "jovial",
  "keen",
  "kind",
  "laughing",
  "loving",
  "lucid",
  "magical",
  "modest",
  "musing",
  "mystifying",
  "naughty",
  "nervous",
  "nice",
  "nifty",
  "nostalgic",
  "objective",
  "optimistic",
  "peaceful",
  "pedantic",
  "pensive",
  "practical",
  "priceless",
  "quirky",
  "quizzical",
  "recursing",
  "relaxed",
  "reverent",
  "romantic",
  "sad",
  "serene",
  "sharp",
  "silly",
  "sleepy",
  "stoic",
  "strange",
  "stupefied",
  "suspicious",
  "sweet",
  "tender",
  "thirsty",
  "trusting",
  "unruffled",
  "upbeat",
  "vibrant",
  "vigilant",
  "vigorous",
  "wizardly",
  "wonderful",
  "xenodochial",
  "youthful",
  "zealous",
  "zen",
];

const right = [
  "agnesi",
  "albattani",
  "allen",
  "almeida",
  "antonelli",
  "archimedes",
  "ardinghelli",
  "aryabhata",
  "austin",
  "babbage",
  "banach",
  "banzai",
  "bardeen",
  "bartik",
  "bassi",
  "beaver",
  "bell",
  "benz",
  "bhabha",
  "bhaskara",
  "black",
  "blackburn",
  "blackwell",
  "bohr",
  "booth",
  "borg",
  "bose",
  "bouman",
  "boyd",
  "brahmagupta",
  "brattain",
  "brown",
  "buck",
  "burnell",
  "cannon",
  "carson",
  "cartwright",
  "carver",
  "cerf",
  "chandrasekhar",
  "chaplygin",
  "chatelet",
  "chatterjee",
  "chaum",
  "chebyshev",
  "clarke",
  "cohen",
  "colden",
  "cori",
  "cray",
  "curie",
  "curran",
  "darwin",
  "davinci",
  "dewdney",
  "dhawan",
  "diffie",
  "dijkstra",
  "dirac",
  "driscoll",
  "dubinsky",
  "easley",
  "edison",
  "einstein",
  "elbakyan",
  "elgamal",
  "elion",
  "ellis",
  "engelbart",
  "euclid",
  "euler",
  "faraday",
  "feistel",
  "fermat",
  "fermi",
  "feynman",
  "franklin",
  "gagarin",
  "galileo",
  "galois",
  "ganguly",
  "gates",
  "gauss",
  "germain",
  "goldberg",
  "goldstine",
  "goldwasser",
  "golick",
  "goodall",
  "gould",
  "greider",
  "grothendieck",
  "haibt",
  "hamilton",
  "haslett",
  "hawking",
  "heisenberg",
  "hellman",
  "hermann",
  "herschel",
  "hertz",
  "heyrovsky",
  "hodgkin",
  "hofstadter",
  "hoover",
  "hopper",
  "hugle",
  "hypatia",
  "ishizaka",
  "jackson",
  "jang",
  "jemison",
  "jennings",
  "jepsen",
  "johnson",
  "joliot",
  "jones",
  "kalam",
  "kapitsa",
  "kare",
  "keldysh",
  "keller",
  "kepler",
  "khayyam",
  "khorana",
  "kilby",
  "kirch",
  "knuth",
  "kowalevski",
  "lalande",
  "lamarr",
  "lamport",
  "leakey",
  "leavitt",
  "lederberg",
  "lehmann",
  "lewin",
  "lichterman",
  "liskov",
  "lovelace",
  "lumiere",
  "mahavira",
  "margulis",
  "matsumoto",
  "maxwell",
  "mayer",
  "mccarthy",
  "mcclintock",
  "mclaren",
  "mclean",
  "mcnulty",
  "meitner",
  "mendel",
  "mendeleev",
  "meninsky",
  "merkle",
  "mestorf",
  "mirzakhani",
  "montalcini",
  "moore",
  "morse",
  "moser",
  "murdock",
  "napier",
  "nash",
  "neumann",
  "newton",
  "nightingale",
  "nobel",
  "noether",
  "northcutt",
  "noyce",
  "panini",
  "pare",
  "pascal",
  "pasteur",
  "payne",
  "perlman",
  "pike",
  "poincare",
  "poitras",
  "proskuriakova",
  "ptolemy",
  "raman",
  "ramanujan",
  "rhodes",
  "ride",
  "ritchie",
  "robinson",
  "roentgen",
  "rosalind",
  "rubin",
  "saha",
  "sammet",
  "sanderson",
  "satoshi",
  "shamir",
  "shannon",
  "shaw",
  "shirley",
  "shockley",
  "shtern",
  "sinoussi",
  "snyder",
  "solomon",
  "spence",
  "stonebraker",
  "sutherland",
  "swanson",
  "swartz",
  "swirles",
  "taussig",
  "tesla",
  "tharp",
  "thompson",
  "torvalds",
  "tu",
  "turing",
  "varahamihira",
  "vaughan",
  "villani",
  "visvesvaraya",
  "volhard",
  "wescoff",
  "wilbur",
  "wiles",
  "williams",
  "williamson",
  "wilson",
  "wing",
  "wozniak",
  "wright",
  "wu",
  "yalow",
  "yonath",
  "zhukovsky",
];
