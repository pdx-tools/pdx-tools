import React, { useEffect } from "react";
import icons from "./icons.png";
import melted from "./melted.webp";
import games from "./games.webp";
import { HeroFileInput } from "./HeroFileInput";
import { Link } from "@/components/Link";
import { BrowserCheck } from "./BrowserCheck";
import {
  ChromeIcon,
  EdgeIcon,
  FirefoxIcon,
  SafariIcon,
} from "@/components/icons";
import classes from "./Home.module.css";
import { ImageGallery } from "./ImageGallery";
import { HomeLeaderboard } from "./HomeLeaderboard";
import { AchievementWall } from "./AchievementWall";
import { cx } from "class-variance-authority";

interface HomeProps {
  subtitle?: React.ReactNode;
}

function Lip() {
  return (
    <svg
      viewBox="0 0 1440 58"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      className="max-h-28 w-full bg-white dark:bg-slate-900"
      preserveAspectRatio="none"
    >
      <path
        className="fill-teal-900"
        d="M-100 58C-100 58 218.416 36.3297 693.5 36.3297C1168.58 36.3297 1487 58 1487 58V-3.8147e-06H-100V58Z"
      ></path>
    </svg>
  );
}

export const Home = ({ subtitle }: HomeProps) => {
  return (
    <div className={`w-full ${classes.main}`}>
      <div
        className={cx(
          "px-5 py-12 text-lg odd:bg-teal-900 odd:text-white even:bg-white md:px-9",
          classes.row,
        )}
      >
        <div className="mx-auto grid max-w-7xl justify-center gap-8 lg:grid-cols-2 xl:gap-16 2xl:gap-24">
          <div className="flex flex-col gap-y-4 justify-self-end lg:max-w-lg">
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white sm:mt-0 lg:mt-6 lg:text-5xl xl:text-6xl">
              Explore the world{" "}
              <span className="block italic supports-[text-wrap:balance]:inline">
                you created
              </span>
            </h1>
            <p className="mt-8 grid max-w-prose gap-4 text-base text-gray-300 sm:text-xl lg:text-lg xl:text-xl">
              Save files contain a treasure trove of information. PDX Tools is a
              modern save file analyzer that will unlock hidden EU4 insights
              without the save leaving your browser.
            </p>
            <p className="grid max-w-prose gap-4 text-base text-gray-300 sm:text-xl lg:text-lg xl:text-xl">
              Ready to explore maps, timelapses, and charts?
            </p>

            <div className="flex flex-col items-center justify-center gap-2 lg:justify-start">
              <div className="text-base text-gray-300">
                No save?{" "}
                <Link href="/eu4/saves/l3mDIfueYIB-gjB0gOliK" variant="light">
                  Checkout a sample
                </Link>
              </div>
            </div>
            <BrowserCheck />
          </div>
          <section className="flex w-full flex-col items-center justify-center">
            <div className="flex">
              <HeroFileInput />
              {subtitle}
            </div>
          </section>
        </div>
      </div>
      <Lip />
      <div
        className={cx(
          classes.row,
          "flex w-full flex-col items-center justify-center px-5 py-16 text-xl odd:bg-white even:bg-teal-900 even:text-white md:px-9 dark:odd:bg-transparent dark:even:bg-transparent",
        )}
      >
        <ImageGallery />
      </div>
      <div
        className={cx(
          classes.row,
          "flex justify-center px-5 py-16 text-lg odd:bg-white even:bg-teal-900 even:text-white md:px-9 dark:odd:bg-transparent dark:even:bg-transparent",
        )}
      >
        <div className="max-w-7xl">
          <h2 className="text-center text-3xl font-extrabold tracking-tight xl:text-4xl">
            Questions? Answered.
          </h2>
          <p className="mb-6 mt-3 text-center text-xl">
            PDX Tools can help you answer these EU4 questions
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-y-6 xl:grid-cols-4">
            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white">
              <p className="text-center text-2xl">
                Could a royal marriage cause a{" "}
                <abbr title="Personal Union">PU</abbr> or inheritance?
              </p>
            </div>
            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white">
              <p className="text-center text-2xl">
                How much mana was spent developing provinces?
              </p>
            </div>
            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white sm:col-span-2">
              <p className="text-center text-2xl">
                How much more dev is needed for religious rebels to change the
                state religion?
              </p>
            </div>
            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white">
              <p className="text-center text-2xl">
                How fast did the reformation spread?
              </p>
            </div>

            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white">
              <p className="text-center text-2xl">
                What one time advisor events remain?
              </p>
            </div>

            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white sm:col-span-2">
              <p className="text-center text-2xl">
                What is the reign weighted running average of monarch power?
              </p>
            </div>
            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white">
              <p className="text-center text-2xl">
                How much more dev is needed to culture shift?
              </p>
            </div>
            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white">
              <p className="text-center text-2xl">
                What wars were wars of attrition?
              </p>
            </div>
            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-6 text-white">
              <p className="text-center text-2xl">
                What heirs failed to take the throne?
              </p>
            </div>
            <div className="mx-2 flex items-center justify-center rounded-xl border-4 border-solid border-white px-9 py-4 text-white">
              <p className="text-center text-2xl">
                What are the most popular idea groups?
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className={cx(
          classes.row,
          "flex justify-center px-5 py-16 text-lg odd:bg-white even:bg-teal-900 even:text-white md:px-9 dark:odd:bg-transparent dark:even:bg-transparent",
        )}
      >
        <div className="flex max-w-7xl flex-col items-center">
          <h2 className="text-center text-3xl font-extrabold tracking-tight xl:text-4xl">
            Achievement Leaderboards
          </h2>
          <p className="mb-6 mt-3 max-w-prose text-center text-xl">
            Go for gold! Uploaded saves are tagged with{" "}
            <Link href="/eu4/achievements">supported achievements</Link>.
            Competition kept fresh with saves on the latest patch prioritized.
          </p>
          <AchievementWall />
          <HomeLeaderboard />
        </div>
      </div>

      <div
        className={cx(
          classes.row,
          "flex justify-center px-5 py-16 text-lg odd:bg-white even:bg-teal-900 even:text-white md:px-9 dark:odd:bg-transparent dark:even:bg-transparent",
        )}
      >
        <section>
          <div className="grid max-w-prose gap-4">
            <h2 className="text-2xl font-bold">
              BYOB (Bring your own browser)
            </h2>
            <p>
              No account needed, no downloads, no installs. All analysis takes
              place within the browser with unparalleled speed
            </p>
            <p>Saves can be uploaded to be shared with others or as a backup</p>
            <p>
              Uploaded saves receive enhancements automatically as PDX Tools is
              updated
            </p>
            <div className="flex flex-col gap-y-2">
              <div className="flex items-center gap-x-2">
                <FirefoxIcon className="h-8 w-8 text-gray-300" />
                <div className="h-6 border-y-0 border-l border-r-0 border-dotted border-gray-300" />
                <ChromeIcon className="h-8 w-8 text-gray-300" />
                <div className="h-6 border-y-0 border-l border-r-0 border-dotted border-gray-300" />
                <EdgeIcon className="h-8 w-8 text-gray-300" />
                <div className="h-6 border-y-0 border-l border-r-0 border-dotted border-gray-300" />
                <SafariIcon className="h-8 w-8 text-gray-300" />
              </div>
              <div className="text-xs">
                Recommended: Chrome (88+), Edge (88+).
                <div>Supported: Firefox (105+), Safari (17.0+).</div>
              </div>
            </div>
          </div>
          <div className="flex justify-center">
            <span
              className="drop-shadow-xl"
              style={{ fontSize: "200px", lineHeight: "1" }}
            >
              ☁️
            </span>
          </div>
        </section>
      </div>

      <div
        className={cx(
          classes.row,
          "flex justify-center px-5 py-16 text-lg odd:bg-white even:bg-teal-900 even:text-white md:px-9 dark:odd:bg-transparent dark:even:bg-transparent",
        )}
      >
        <section>
          <div className="grid max-w-prose gap-4">
            <h2 className="text-2xl font-bold">Melting Support</h2>
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
            <img
              src={melted}
              height={232}
              width={287}
              className="drop-shadow-xl"
              alt="Screenshot of EU4 showing a melted save being loaded"
            />
          </div>
        </section>
      </div>

      <div
        className={cx(
          classes.row,
          "flex justify-center px-5 py-16 text-lg odd:bg-white even:bg-teal-900 even:text-white md:px-9 dark:odd:bg-transparent dark:even:bg-transparent",
        )}
      >
        <section>
          <div className="grid max-w-prose gap-4">
            <h2 className="text-2xl font-bold">More Games!</h2>
            <p>The following games can be loaded:</p>
            <ul>
              <li>Europa Univeralis IV (1.29+)</li>
              <li>Hearts of Iron IV (1.0+)</li>
              <li>Crusader Kings III (1.0+)</li>
              <li>Victoria 3 (1.0+)</li>
              <li>Imperator: Rome (1.0+)</li>
            </ul>
          </div>
          <div>
            <img
              alt=""
              className="drop-shadow-xl"
              loading="lazy"
              src={games}
              height={338}
              width={600}
            />
          </div>
        </section>
      </div>

      <div
        className={cx(
          classes.row,
          "flex justify-center px-5 py-16 text-lg odd:bg-white even:bg-teal-900 even:text-white md:px-9 dark:odd:bg-transparent dark:even:bg-transparent",
        )}
      >
        <section>
          <div className="grid max-w-prose gap-4">
            <h2 className="text-2xl font-bold">Community</h2>
            <p>PDX Tools is powered by community use and feedback</p>
            <p>
              Have ideas, questions, or bug reports? Join the{" "}
              <Link href="https://discord.gg/rCpNWQW">discord!</Link>
            </p>
            <p>
              See PDX Tools on{" "}
              <Link href="https://github.com/pdx-tools/pdx-tools">
                our Github
              </Link>{" "}
              and help contribute!
            </p>
          </div>
          <div>
            <img alt="" loading="lazy" src={icons} height={191} width={400} />
          </div>
        </section>
      </div>
      <footer className="my-4 text-center text-sm text-slate-400">
        <a href="https://www.flaticon.com/free-icons/north">EU4</a>,{" "}
        <a href="https://www.flaticon.com/free-icons/victoria-day">V3</a>, and{" "}
        <a href="https://www.flaticon.com/free-icons/military">HOI4</a> icons
        created by Freepik and Good Ware - Flaticon
      </footer>
    </div>
  );
};
