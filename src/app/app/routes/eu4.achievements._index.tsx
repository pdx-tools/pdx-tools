import { redirect } from "react-router";

/**
 * The achievement list now leads the EU4 hub, so this URL keeps working by
 * pointing at the section it became. The leaderboard of one achievement,
 * `/eu4/achievements/:id`, is untouched: those are the links players share.
 */
export const loader = () => redirect("/eu4#achievements", 301);

export default function Eu4AchievementsIndex() {
  return null;
}
