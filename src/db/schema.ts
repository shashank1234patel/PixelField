import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  authType: text('auth_type').notNull().default('guest'), // 'google' | 'guest'
  email: text('email'),
  displayName: text('display_name').notNull(),
  avatarColor: text('avatar_color').notNull().default('#2D6A4F'),
  hatStyle: text('hat_style').notNull().default('none'), // 'none' | 'straw' | 'cap' | 'flower'
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  sessionTokenHash: text('session_token_hash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const rooms = pgTable('rooms', {
  id: text('id').primaryKey(),
  shortCode: text('short_code').notNull().unique(),
  name: text('name').notNull(),
  ownerUid: text('owner_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  visibility: text('visibility').notNull().default('link'), // 'code' | 'link' | 'open'
  capacity: integer('capacity').notNull().default(15), // 10..15
  allowLateJoin: boolean('allow_late_join').notNull().default(true),
  buildPolicy: text('build_policy').notNull().default('everyone'), // 'everyone' | 'host_only' | 'build_zones'
  passwordHash: text('password_hash'),
  status: text('status').notNull().default('lobby'), // 'lobby' | 'active' | 'closed'
  template: text('template').notNull().default('willowbrook_starter'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
});

export const worlds = pgTable('worlds', {
  id: text('id').primaryKey(),
  roomId: text('room_id')
    .references(() => rooms.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  width: integer('width').notNull().default(64),
  height: integer('height').notNull().default(48),
  chunkSize: integer('chunk_size').notNull().default(16),
  mapVersion: integer('map_version').notNull().default(1),
  saveVersion: integer('save_version').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const worldChunks = pgTable(
  'world_chunks',
  {
    id: serial('id').primaryKey(),
    worldId: text('world_id')
      .references(() => worlds.id, { onDelete: 'cascade' })
      .notNull(),
    chunkX: integer('chunk_x').notNull(),
    chunkY: integer('chunk_y').notNull(),
    groundData: text('ground_data').notNull(),
    objectData: text('object_data').notNull(),
    revision: integer('revision').notNull().default(1),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('world_chunks_world_xy_idx').on(table.worldId, table.chunkX, table.chunkY),
  ]
);

export const worldEdits = pgTable('world_edits', {
  id: serial('id').primaryKey(),
  worldId: text('world_id')
    .references(() => worlds.id, { onDelete: 'cascade' })
    .notNull(),
  actorUid: text('actor_uid').references(() => users.uid, { onDelete: 'set null' }),
  tileX: integer('tile_x').notNull(),
  tileY: integer('tile_y').notNull(),
  layer: text('layer').notNull(), // 'ground' | 'object'
  oldTile: integer('old_tile').notNull(),
  newTile: integer('new_tile').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const roomMemberships = pgTable(
  'room_memberships',
  {
    id: serial('id').primaryKey(),
    roomId: text('room_id')
      .references(() => rooms.id, { onDelete: 'cascade' })
      .notNull(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull().default('player'), // 'host' | 'moderator' | 'player'
    joinState: text('join_state').notNull().default('joined'), // 'joined' | 'left' | 'kicked' | 'banned'
    reconnectTokenHash: text('reconnect_token_hash'),
    reconnectExpiresAt: timestamp('reconnect_expires_at'),
    banExpiresAt: timestamp('ban_expires_at'),
    lastX: integer('last_x').notNull().default(32),
    lastY: integer('last_y').notNull().default(24),
    lastVisitedAt: timestamp('last_visited_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('room_memberships_room_user_idx').on(table.roomId, table.userUid),
  ]
);

export const chatModerationLogs = pgTable('chat_moderation_logs', {
  id: serial('id').primaryKey(),
  roomId: text('room_id')
    .references(() => rooms.id, { onDelete: 'cascade' })
    .notNull(),
  reporterUid: text('reporter_uid').references(() => users.uid, { onDelete: 'set null' }),
  targetUid: text('target_uid').notNull(),
  action: text('action').notNull(), // 'mute' | 'report' | 'kick' | 'ban'
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  ownedRooms: many(rooms),
  memberships: many(roomMemberships),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  owner: one(users, {
    fields: [rooms.ownerUid],
    references: [users.uid],
  }),
  world: one(worlds, {
    fields: [rooms.id],
    references: [worlds.roomId],
  }),
  memberships: many(roomMemberships),
}));

export const worldsRelations = relations(worlds, ({ one, many }) => ({
  room: one(rooms, {
    fields: [worlds.roomId],
    references: [rooms.id],
  }),
  chunks: many(worldChunks),
  edits: many(worldEdits),
}));

export const worldChunksRelations = relations(worldChunks, ({ one }) => ({
  world: one(worlds, {
    fields: [worldChunks.worldId],
    references: [worlds.id],
  }),
}));

export const roomMembershipsRelations = relations(roomMemberships, ({ one }) => ({
  room: one(rooms, {
    fields: [roomMemberships.roomId],
    references: [rooms.id],
  }),
  user: one(users, {
    fields: [roomMemberships.userUid],
    references: [users.uid],
  }),
}));
