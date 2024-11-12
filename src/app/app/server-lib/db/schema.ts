import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  text,
  pgEnum,
  timestamp,
  uniqueIndex,
  boolean,
  integer,
  smallint,
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
  timestamp("created_on", { precision: 6, withTimezone: true })
    .notNull()
    .defaultNow();

export const users = pgTable(
  "users",
  {
    userId: text("user_id").primaryKey(),
    steamId: text("steam_id"),
    steamName: text("steam_name"),
    email: text("email"),
    account: account("account").notNull().default("free"),
    display: text("display"),
    createdOn: timestampColumn(),
    apiKey: text("api_key"),
  },
  (users) => ({
    steamIdIndex: uniqueIndex("idx_users_steam_id").on(users.steamId),
  }),
);
export type User = InferSelectModel<typeof users>;
export type Account = User["account"];

export const saves = pgTable(
  "saves",
  {
    id: text("id").primaryKey(),
    createdOn: timestampColumn(),
    locked: boolean("locked").default(false).notNull(),
    filename: text("filename").notNull(),
    userId: text("user_id")
      .notNull()
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
  },
  (saves) => ({
    achieveIdsIndex: index("idx_save_achieve_ids").on(saves.achieveIds),
    createdOnIndex: index("idx_save_creation").on(saves.createdOn),
    hashIndex: uniqueIndex("idx_save_hash").on(saves.hash),
    playersIndex: index("idx_save_players").on(saves.players),
    playthroughIdIndex: index("idx_saves_playthrough_id").on(
      saves.playthroughId,
    ),
  }),
);
export type Save = InferSelectModel<typeof saves>;
export type NewSave = InferInsertModel<typeof saves>;
export type GameDifficulty = Save["gameDifficulty"];
