import type { UserId } from "@/lib/auth";
import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  text,
  pgEnum,
  timestamp,
  uniqueIndex,
  boolean,
  integer,
  smallint,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const account = pgEnum("account", ["free", "admin"]);
export const gameDifficulty = pgEnum("game_difficulty", [
  "very_easy",
  "easy",
  "normal",
  "hard",
  "very_hard",
]);

const timestampColumn = () =>
  timestamp("created_on", { precision: 6, withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    userId: text("user_id").$type<UserId>().primaryKey(),
    steamId: text("steam_id"),
    steamName: text("steam_name"),
    email: text("email"),
    account: account("account").notNull().default("free"),
    display: text("display"),
    createdOn: timestampColumn(),
    apiKey: text("api_key"),
    features: text("features")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (users) => [uniqueIndex("idx_users_steam_id").on(users.steamId)],
);
export type User = InferSelectModel<typeof users>;
export type Account = User["account"];

export const eu4Saves = pgTable(
  "eu4_saves",
  {
    id: text("id").primaryKey(),
    createdOn: timestampColumn(),
    locked: boolean("locked").default(false).notNull(),
    filename: text("filename").notNull(),
    userId: text("user_id")
      .notNull()
      .$type<UserId>()
      .references(() => users.userId),
    hash: text("hash").notNull(),
    date: text("date").notNull(),
    days: integer("days").notNull(),
    scoreDays: integer("score_days"),
    playerTag: text("player_tag").notNull(),
    playerTagName: text("player_tag_name"),
    saveVersionFirst: smallint("save_version_first").notNull(),
    saveVersionSecond: smallint("save_version_second").notNull(),
    saveVersionThird: smallint("save_version_third").notNull(),
    saveVersionFourth: smallint("save_version_fourth").notNull(),
    achieveIds: integer("achieve_ids").array().notNull(),
    players: text("players").array().notNull(),
    playerStartTag: text("player_start_tag"),
    playerStartTagName: text("player_start_tag_name"),
    gameDifficulty: gameDifficulty("game_difficulty").notNull(),
    aar: text("aar"),
    playthroughId: text("playthrough_id").notNull(),
    leaderboardQualified: boolean("leaderboard_qualified").notNull().default(true),
  },
  (saves) => [
    index("idx_eu4_save_creation").on(saves.createdOn),
    uniqueIndex("idx_eu4_save_hash").on(saves.hash),
    index("idx_eu4_save_players").on(saves.players),
    index("idx_eu4_saves_playthrough_id").on(saves.playthroughId),
    index("idx_eu4_saves_user_created").on(saves.userId, saves.createdOn.desc()),
  ],
);
export type Save = InferSelectModel<typeof eu4Saves>;

/**
 * This table stores the best qualified save for each achievement and playthrough.
 * Triggers update it when a save changes. See migration 0008.
 */
export const eu4AchievementBests = pgTable(
  "eu4_achievement_bests",
  {
    achieveId: integer("achieve_id").notNull(),
    playthroughId: text("playthrough_id").notNull(),
    saveId: text("save_id")
      .notNull()
      .references(() => eu4Saves.id, { onDelete: "cascade" }),
    scoreDays: integer("score_days").notNull(),
    createdOn: timestamp("created_on", { precision: 6, withTimezone: true }).notNull(),
  },
  (bests) => [
    primaryKey({ columns: [bests.achieveId, bests.playthroughId] }),
    index("idx_eu4_achievement_bests_rank").on(bests.achieveId, bests.scoreDays, bests.createdOn),
  ],
);
export type NewSave = InferInsertModel<typeof eu4Saves>;
export type GameDifficulty = Save["gameDifficulty"];

export const eu5Saves = pgTable(
  "eu5_saves",
  {
    id: text("id").primaryKey(),
    createdOn: timestampColumn(),
    filename: text("filename").notNull(),
    userId: text("user_id")
      .notNull()
      .$type<UserId>()
      .references(() => users.userId),
    hash: text("hash").notNull(),
    date: text("date").notNull(),
    /** The game's own campaign id, shared by every save of the campaign. */
    playthroughId: text("playthrough_id").notNull(),
    playthroughName: text("playthrough_name").notNull(),
    /** Human player names. More than one means a multiplayer save. */
    players: text("players").array().notNull(),
    /** Country tag for a single-player save. */
    playerTag: text("player_tag"),
    /** Flag key for the player's country. */
    playerFlag: text("player_flag"),
    /** Country name from the save. */
    playerCountryName: text("player_country_name"),
    versionMajor: integer("version_major").notNull(),
    versionMinor: integer("version_minor").notNull(),
    versionPatch: integer("version_patch").notNull(),
  },
  (saves) => [
    index("idx_eu5_save_creation").on(saves.createdOn),
    uniqueIndex("idx_eu5_save_hash").on(saves.hash),
    index("idx_eu5_saves_user_created").on(saves.userId, saves.createdOn.desc()),
    index("idx_eu5_saves_playthrough_id").on(saves.playthroughId),
  ],
);
export type Eu5Save = InferSelectModel<typeof eu5Saves>;
export type NewEu5Save = InferInsertModel<typeof eu5Saves>;
