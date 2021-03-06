import React, { useEffect, useState } from "react";
import map from "./map.webp";
import graphs from "./graphs.png";
import icons from "./icons.png";
import achievement from "./achievement.png";
import melted from "./melted.webp";
import games from "./games.webp";
import headline from "./headline.png";
import discover from "./discover.png";
import { Shadow } from "@/components/Shadow";
import { AnalyzeBox } from "./AnalyzeBox";
import { useSelector } from "react-redux";
import { selectEngineError } from "@/features/engine";
import { Alert } from "antd";
import Link from "next/link";
import { BrowserCheck } from "./BrowserCheck";
import {
  ChromeIcon,
  EdgeIcon,
  FirefoxIcon,
  SafariIcon,
} from "@/components/icons";

interface HomeProps {
  subtitle?: React.ReactNode;
}

// https://getwaves.io/
const computeWaveBackground = ([h, s, l]: number[]) => {
  // prettier-ignore
  const waveSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 1440 320"><path fill="hsl(${h}deg,${s}%,${l / 1.15}%)" fill-opacity="1" d="M0,256L13.3,266.7C26.7,277,53,299,80,272C106.7,245,133,171,160,138.7C186.7,107,213,117,240,138.7C266.7,160,293,192,320,213.3C346.7,235,373,245,400,245.3C426.7,245,453,235,480,218.7C506.7,203,533,181,560,181.3C586.7,181,613,203,640,224C666.7,245,693,267,720,240C746.7,213,773,139,800,144C826.7,149,853,235,880,266.7C906.7,299,933,277,960,277.3C986.7,277,1013,299,1040,288C1066.7,277,1093,235,1120,229.3C1146.7,224,1173,256,1200,256C1226.7,256,1253,224,1280,197.3C1306.7,171,1333,149,1360,160C1386.7,171,1413,213,1427,234.7L1440,256L1440,320L1426.7,320C1413.3,320,1387,320,1360,320C1333.3,320,1307,320,1280,320C1253.3,320,1227,320,1200,320C1173.3,320,1147,320,1120,320C1093.3,320,1067,320,1040,320C1013.3,320,987,320,960,320C933.3,320,907,320,880,320C853.3,320,827,320,800,320C773.3,320,747,320,720,320C693.3,320,667,320,640,320C613.3,320,587,320,560,320C533.3,320,507,320,480,320C453.3,320,427,320,400,320C373.3,320,347,320,320,320C293.3,320,267,320,240,320C213.3,320,187,320,160,320C133.3,320,107,320,80,320C53.3,320,27,320,13,320L0,320Z"></path></svg>  
`;

  return `url("data:image/svg+xml;base64,${btoa(waveSvg)}`;
};

const useWaveBackground = ([h, s, l]: number[]) => {
  const [waveBackground, setWaveBackground] = useState<string | undefined>();

  // For some reason next.js has a hard time running the compute wave background
  // so we save the calculation for client side.
  useEffect(() => {
    setWaveBackground(computeWaveBackground([h, s, l]));
  }, [h, s, l]);

  return waveBackground;
};

export const Home = ({ subtitle }: HomeProps) => {
  const secondaryColor: [number, number, number] = [177, 100, 13.7];
  const sc = secondaryColor;
  const waveBackground = useWaveBackground(secondaryColor);
  const engineError = useSelector(selectEngineError);

  return (
    <div className="main">
      <style jsx>{`
        h1 {
          font-size: 2rem;
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }

        h1 span {
          height: 2em;
          width: 2em;
        }

        .main {
          width: 100%;
          font-size: 1.35rem;
          min-height: 100vh;
        }

        section {
          max-width: 768px;
          display: grid;
          grid-template-areas: "text" "img";
        }

        section > div:nth-child(2) {
          padding-top: 2em;
        }

        @media screen and (min-width: 768px) {
          section {
            gap: 2em;
          }

          .row:nth-child(odd) section {
            grid-template-areas: "text img";
          }

          .row:nth-child(even) section {
            grid-template-areas: "img text";
          }

          section > div:nth-child(2) {
            padding-top: unset;
          }
        }

        .row {
          padding: 3em 1em;
          display: flex;
          justify-content: center;
        }

        .row:nth-child(odd) {
          background-color: hsl(${sc[0]}deg ${sc[1]}% ${sc[2]}%);
        }

        .row:nth-child(odd),
        .row:nth-child(odd) :is(h1, h2, h3) {
          color: white;
        }

        section div:nth-child(1) {
          grid-area: text;
        }

        section div:nth-child(2) {
          grid-area: img;
          display: flex;
          justify-content: center;
        }

        section p.subtitle {
          line-height: 1.5;
          font-size: 2rem;
        }

        section p {
          font-size: 1.2rem;
        }

        img {
          height: fit-content;
        }

        .divider {
          height: 24px;
          border-left: 1px dotted #d7d7db;
        }

        .analyze-box {
          max-width: 1024px;
          display: flex;
        }
      `}</style>

      <div
        className="row"
        style={{
          backgroundImage: waveBackground,
          backgroundPosition: "bottom",
          backgroundRepeat: "repeat-x",
        }}
      >
        <section className="analyze-box flex-col">
          <div className="flex-col gap">
            <AnalyzeBox />
            {subtitle}
            {engineError && (
              <div
                style={{
                  marginBlockStart: "2rem",
                  justifyContent: "flex-start",
                }}
              >
                <Alert type="error" closable={true} message={engineError} />
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="row flex-col items-center">
        <Shadow>
          <img
            src={headline}
            height={685}
            width={1250}
            alt="Screenshot showing map and graph"
          />
        </Shadow>
        <div className="flex-col gap items-center">
          <div style={{ marginTop: "2rem" }}>
            Curious?{" "}
            <Link href="/eu4/saves/_9Hcw32JWTZRx6zK3FVuz">
              <a>Load a sample</a>
            </Link>
          </div>
          <div className="flex-row gap">
            <FirefoxIcon style={{ fill: "lightgrey" }} />
            <div className="divider" />
            <ChromeIcon style={{ fill: "lightgrey" }} />
            <div className="divider" />
            <EdgeIcon style={{ fill: "lightgrey" }} />
            <div className="divider" />
            <SafariIcon style={{ fill: "lightgrey" }} />
          </div>
          <div className="text-xs text-center">
            Works best in Firefox (62+), Chrome (66+), Edge (79+).
            <div>Safari 15.2+ also supported.</div>
          </div>
          <BrowserCheck />
        </div>
      </div>

      <div className="row">
        <section>
          <div>
            <h2>Discover Data</h2>
            <p>
              View data not exposed in game, like one time advisor events,
              budgetary breakdown, mana usage, and religion by dev
            </p>
            <p>
              Marvel at past wars, how the AI allocates ducats, or what national
              ideas are most popular
            </p>
            <p>
              Uncover how ruler stats affect long term mana generation and what
              heirs were unfortunate enough not to see the throne
            </p>
          </div>
          <div>
            <Shadow backgroundColor={secondaryColor}>
              <img
                src={discover}
                height={478}
                width={606}
                alt="Country budgetary breakdown"
              />
            </Shadow>
          </div>
        </section>
      </div>

      <div className="row">
        <section>
          <div>
            <h2>Marvelous Maps</h2>
            <p>
              Pan, zoom, and click around as if EU4 was played within Google
              Maps
            </p>
            <p>
              Overlay terrain on one of the several map modes (political,
              religion, dev, etc)
            </p>
            <p>
              View the world on a timeline and see a more accurate
              representation than the game due to an improved tag switching
              engine
            </p>
            <p>Export high resolution map images</p>
          </div>
          <div>
            <Shadow>
              <img
                src={map}
                height={325}
                width={400}
                alt="EU4 political map simulated in PDX Tools"
              />
            </Shadow>
          </div>
        </section>
      </div>

      <div className="row">
        <section>
          <div>
            <h2>Fine-tune Focus</h2>
            <p>
              All maps, graphs, and data can be filtered to only desired
              countries
            </p>
            <p>
              Keep an eye on how your nation compares to great powers or other
              players. Or turn your eye inwards and ensure healthy subjects
            </p>
            <p>
              Historical ledger data will chart the success and failure of
              countries in income, nation size, and more
            </p>
          </div>
          <div>
            <Shadow backgroundColor={secondaryColor}>
              <img
                src={graphs}
                height={510}
                width={971}
                alt="Screenshot of income graph when analyzing a save"
              />
            </Shadow>
          </div>
        </section>
      </div>

      <div className="row">
        <section>
          <div>
            <h2>BYOB (Bring your own browser)</h2>
            <p>
              No account needed, no downloads, no installs. All analysis takes
              place within the browser with unparalleled speed
            </p>
            <p>Saves can be uploaded to be shared with others or as a backup</p>
            <p>
              Uploaded saves receive enhancements automatically as PDX Tools is
              updated
            </p>
          </div>
          <div>
            <Shadow>
              <span style={{ fontSize: "200px" }}>??????</span>
            </Shadow>
          </div>
        </section>
      </div>

      <div className="row">
        <section>
          <div>
            <h2>Melting Support</h2>
            <p>
              PDX Tools can convert (aka melt) ironman and binary saves into
              normal saves so that one can easily inspect the raw contents
            </p>
            <p>
              As a bonus the newly converted save can be continued in game as if
              it was a normal save all along
            </p>
          </div>
          <div>
            <Shadow backgroundColor={secondaryColor}>
              <img
                src={melted}
                height={232}
                width={287}
                alt="Screenshot of EU4 showing a melted save being loaded"
              />
            </Shadow>
          </div>
        </section>
      </div>

      <div className="row">
        <section>
          <div>
            <h2>Fresh Competition</h2>
            <p>
              An advanced achievement engine uses the game's logic to check if a
              save has completed one of the{" "}
              <Link href="/eu4/achievements">
                <a>supported achievements</a>
              </Link>
            </p>
            <p>
              Uploaded saves are tagged with completed achievements to generate
              a leaderboard of who speed ran a{" "}
              <Link href="/eu4/achievements/18">
                <a>certain achievement</a>
              </Link>{" "}
              the quickest
            </p>
            <p>
              The leaderboard is kept evergreen by enacting a small tax to saves
              on previous patches, just enough to keep the leaderboard fresh
              while allowing exceptional runs to bask in glory forever
            </p>
          </div>
          <div>
            <Shadow>
              <img
                src={achievement}
                height={325}
                width={400}
                loading="lazy"
                alt="Screenshot of the PDX Tools leaderboard for an achievement"
              />
            </Shadow>
          </div>
        </section>
      </div>

      <div className="row">
        <section>
          <div>
            <h2>More Games!</h2>
            <p>The following games can be loaded:</p>
            <ul>
              <li>Europa Univeralis IV</li>
              <li>Hearts of Iron IV</li>
              <li>Crusader Kings III</li>
              <li>Imperator: Rome</li>
            </ul>
          </div>
          <div>
            <Shadow backgroundColor={secondaryColor}>
              <img alt="" loading="lazy" src={games} height={338} width={600} />
            </Shadow>
          </div>
        </section>
      </div>

      <div className="row">
        <section>
          <div>
            <h2>Community</h2>
            <p>PDX Tools is powered by community use and feedback</p>
            <p>
              Have ideas, questions, or bug reports? Join the{" "}
              <a href="https://discord.gg/rCpNWQW">discord!</a>
            </p>
            <p>
              See PDX Tools on{" "}
              <a href="https://github.com/pdx-tools/pdx-tools">our Github</a>{" "}
              and help contribute!
            </p>
          </div>
          <div>
            <img alt="" loading="lazy" src={icons} height={191} width={400} />
          </div>
        </section>
      </div>
    </div>
  );
};
