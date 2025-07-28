import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Game roles
export const ROLES = {
  VILLAGER: 'VILLAGER',
  DOCTOR: 'DOCTOR', 
  DETECTIVE: 'DETECTIVE',
  MAFIA: 'MAFIA'
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Game phases
export const PHASES = {
  LOBBY: 'LOBBY',
  DAY: 'DAY',
  NIGHT: 'NIGHT',
  VOTING: 'VOTING',
  ENDED: 'ENDED'
} as const;

export type Phase = typeof PHASES[keyof typeof PHASES];

// Player status
export const PLAYER_STATUS = {
  ALIVE: 'ALIVE',
  ELIMINATED: 'ELIMINATED',
  SPECTATOR: 'SPECTATOR'
} as const;

export type PlayerStatus = typeof PLAYER_STATUS[keyof typeof PLAYER_STATUS];

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomCode: varchar("room_code", { length: 6 }).unique(),
  name: text("name").notNull(),
  hostId: varchar("host_id").notNull(),
  maxPlayers: integer("max_players").notNull().default(8),
  currentPhase: varchar("current_phase").$type<Phase>().notNull().default('LOBBY'),
  dayNumber: integer("day_number").notNull().default(1),
  timeRemaining: integer("time_remaining").default(300), // seconds
  isActive: boolean("is_active").notNull().default(true),
  geminiApiKey: text("gemini_api_key"),
  narrative: text("narrative").default(''),
  gameLog: jsonb("game_log").$type<string[]>().default([]),
  roleDistribution: jsonb("role_distribution").$type<Record<Role, number>>().default({
    [ROLES.VILLAGER]: 3,
    [ROLES.DOCTOR]: 1,
    [ROLES.DETECTIVE]: 1,
    [ROLES.MAFIA]: 1
  }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull(),
  name: text("name").notNull(),
  role: varchar("role").$type<Role>(),
  status: varchar("status").$type<PlayerStatus>().notNull().default('ALIVE'),
  isReady: boolean("is_ready").notNull().default(false),
  isHost: boolean("is_host").notNull().default(false),
  votes: integer("votes").notNull().default(0),
  votedFor: varchar("voted_for"),
  lastAction: text("last_action"),
  actionTarget: varchar("action_target"),
  joinedAt: timestamp("joined_at").defaultNow()
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull(),
  playerId: varchar("player_id").notNull(),
  message: text("message").notNull(),
  isSystemMessage: boolean("is_system_message").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow()
});

// Relations
export const gamesRelations = relations(games, ({ many }) => ({
  players: many(players),
  chatMessages: many(chatMessages),
}));

export const playersRelations = relations(players, ({ one }) => ({
  game: one(games, {
    fields: [players.gameId],
    references: [games.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  game: one(games, {
    fields: [chatMessages.gameId],
    references: [games.id],
  }),
  player: one(players, {
    fields: [chatMessages.playerId],
    references: [players.id],
  }),
}));

// Insert schemas
export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  roomCode: true,
  createdAt: true,
  updatedAt: true
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  joinedAt: true
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true
});

// Types
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

// Game state type for real-time updates
export interface GameState {
  game: Game;
  players: Player[];
  chatMessages: ChatMessage[];
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'GAME_UPDATE' | 'PLAYER_JOINED' | 'PLAYER_LEFT' | 'CHAT_MESSAGE' | 'PHASE_CHANGE' | 'ROLE_REVEAL' | 'VOTE_CAST' | 'ACTION_TAKEN';
  payload: any;
  gameId: string;
  playerId?: string;
}
