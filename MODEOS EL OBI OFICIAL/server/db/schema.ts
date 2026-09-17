import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ==========================================
// 1. TABLA OBLIGATORIA (PRESERVADA - NO BORRAR)
// ==========================================
export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(),
  userId: varchar('user_id', { length: 32 }).notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 2. TABLA DE ADMINISTRADORES DETECTADOS
// ==========================================
export const detectedAdmins = pgTable('detected_admins', {
  id: text('id').primaryKey(), // Formato: guildId-userId
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  userId: varchar('user_id', { length: 32 }).notNull(),
  userTag: text('user_tag').notNull(),
  roles: text('roles'), // Lista de roles en texto
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
});

// ==========================================
// 3. TABLA DE ADVERTENCIAS (WARNS)
// ==========================================
export const warns = pgTable('warns', {
  id: text('id').primaryKey(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  userId: varchar('user_id', { length: 32 }).notNull(),
  moderatorId: varchar('moderator_id', { length: 32 }).notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 4. TABLA DE LISTA NEGRA (BLACKLIST)
// ==========================================
export const blacklist = pgTable('blacklist', {
  id: text('id').primaryKey(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  userId: varchar('user_id', { length: 32 }).notNull(),
  reason: text('reason').notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});