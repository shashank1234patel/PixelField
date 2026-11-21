import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adventureProgress,
  chatModerationLogs,
  roomMemberships,
  rooms,
  users,
  worldChunks,
  worldEdits,
  worlds,
} from '../db/schema.ts';
import {
  type AdventureState,
  CHAPTER_1_ID,
  createInitialAdventureState,
  normalizeAdventureState,
} from '../shared/adventureData.ts';
import type {
  BuildPolicy,
  MemberRole,
  RoomStatus,
  RoomSummary,
  RoomVisibility,
} from '../shared/protocol.ts';
import {
  type ChunkRecord,
  type WorldMapData,
  generateStarterVillage,
  packMapToChunks,
  unpackChunksToMap,
} from '../shared/starterMap.ts';
import { CHUNK_SIZE, SPAWN_TILE, WORLD_HEIGHT, WORLD_WIDTH, tileIndex } from '../shared/tiles.ts';
import {
  generateSecureId,
  generateShortCode,
  hashPassword,
  hashToken,
  safeCompareHex,
  sanitizePlainText,
  verifyPassword,
} from './crypto.ts';

const VALID_VISIBILITIES = new Set<RoomVisibility>(['code', 'link', 'open']);
const VALID_POLICIES = new Set<BuildPolicy>(['everyone', 'host_only', 'build_zones']);

export interface PendingEditLog {
  actorUid: string;
  tileX: number;
  tileY: number;
  layer: 'ground' | 'object';
  oldTile: number;
  newTile: number;
}

export function formatRoomSummary(
  row: typeof rooms.$inferSelect,
  onlineCount: number,
  ownerName?: string
): RoomSummary {
  return {
    id: row.id,
    shortCode: row.shortCode,
    name: row.name,
    ownerUid: row.ownerUid,
    ownerName,
    visibility: (VALID_VISIBILITIES.has(row.visibility as RoomVisibility)
      ? row.visibility
      : 'link') as RoomVisibility,
    capacity: row.capacity,
    allowLateJoin: row.allowLateJoin,
    buildPolicy: (VALID_POLICIES.has(row.buildPolicy as BuildPolicy)
      ? row.buildPolicy
      : 'everyone') as BuildPolicy,
    hasPassword: Boolean(row.passwordHash),
    status: row.status as RoomStatus,
    template: row.template,
    onlineCount,
    lastActiveAt: row.lastActiveAt.toISOString(),
  };
}

export async function createRoomWithWorld(params: {
  ownerUid: string;
  name: string;
  visibility?: RoomVisibility;
  capacity?: number;
  allowLateJoin?: boolean;
  buildPolicy?: BuildPolicy;
  password?: string;
  seed?: number;
}): Promise<{ room: RoomSummary; reconnectToken: string }> {
  const cleanName = sanitizePlainText(params.name, 42);
  if (cleanName.length < 2) {
    throw new Error('Room name must be at least 2 characters.');
  }

  const visibility: RoomVisibility =
    params.visibility && VALID_VISIBILITIES.has(params.visibility) ? params.visibility : 'link';
  const capacity = Math.min(15, Math.max(10, Math.round(params.capacity ?? 15)));
  const allowLateJoin = params.allowLateJoin ?? true;
  const buildPolicy: BuildPolicy =
    params.buildPolicy && VALID_POLICIES.has(params.buildPolicy) ? params.buildPolicy : 'everyone';
  const passwordHash =
    params.password && params.password.trim().length > 0 ? hashPassword(params.password.trim()) : null;

  const roomId = generateSecureId(16);
  const worldId = generateSecureId(16);
  const reconnectToken = generateSecureId(24);
  const reconnectExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  // Generate unique short code
  let shortCode = generateShortCode(6);
  for (let attempt = 0; attempt < 5; attempt++) {
    const conflict = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.shortCode, shortCode)).limit(1);
    if (conflict.length === 0) break;
    shortCode = generateShortCode(6);
  }

  const parsedSeed =
    params.seed !== undefined && params.seed !== null && String(params.seed).trim() !== ''
      ? Number(params.seed)
      : NaN;
  const safeSeed = Number.isFinite(parsedSeed)
    ? (parsedSeed >>> 0) || 1
    : Math.floor(Math.random() * 1_000_000) + 1;

  const starterMap = generateStarterVillage(safeSeed, WORLD_WIDTH, WORLD_HEIGHT);
  const chunks = packMapToChunks(starterMap, CHUNK_SIZE);

  try {
    const [insertedRoom] = await db
      .insert(rooms)
      .values({
        id: roomId,
        shortCode,
        name: cleanName,
        ownerUid: params.ownerUid,
        visibility,
        capacity,
        allowLateJoin,
        buildPolicy,
        passwordHash,
        status: 'lobby',
        template: 'willowbrook_starter',
      })
      .returning();

    await db.insert(worlds).values({
      id: worldId,
      roomId,
      width: starterMap.width,
      height: starterMap.height,
      chunkSize: CHUNK_SIZE,
      mapVersion: 2,
      saveVersion: 1,
    });

    await db.insert(worldChunks).values(
      chunks.map((ch) => ({
        worldId,
        chunkX: ch.chunkX,
        chunkY: ch.chunkY,
        groundData: JSON.stringify(ch.ground),
        objectData: JSON.stringify(ch.objects),
        revision: 1,
      }))
    );

    await db.insert(roomMemberships).values({
      roomId,
      userUid: params.ownerUid,
      role: 'host',
      joinState: 'joined',
      reconnectTokenHash: hashToken(reconnectToken),
      reconnectExpiresAt,
      lastX: SPAWN_TILE.x,
      lastY: SPAWN_TILE.y,
    });

    await db.insert(adventureProgress).values({
      roomId,
      chapterId: CHAPTER_1_ID,
      stateJson: JSON.stringify(createInitialAdventureState()),
    });

    return {
      room: formatRoomSummary(insertedRoom, 0),
      reconnectToken,
    };
  } catch (error) {
    console.error('Failed to create room with world:', error);
    throw new Error('Could not create village world. Please try again.', { cause: error });
  }
}

export async function getRoomByIdOrCode(identifier: string): Promise<typeof rooms.$inferSelect | null> {
  const clean = identifier.trim();
  if (!clean) return null;
  try {
    // Short codes are 6 uppercase alphanumerics; room IDs are 32 hex chars
    if (clean.length <= 8) {
      const rows = await db.select().from(rooms).where(eq(rooms.shortCode, clean.toUpperCase())).limit(1);
      return rows[0] ?? null;
    }
    const rows = await db.select().from(rooms).where(eq(rooms.id, clean)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Room lookup failed:', error);
    throw new Error('Could not look up room.', { cause: error });
  }
}

export async function listOpenRooms(onlineCounter: (roomId: string) => number): Promise<RoomSummary[]> {
  try {
    const rows = await db
      .select({
        room: rooms,
        ownerName: users.displayName,
      })
      .from(rooms)
      .innerJoin(users, eq(rooms.ownerUid, users.uid))
      .where(and(eq(rooms.visibility, 'open'), ne(rooms.status, 'closed')))
      .orderBy(desc(rooms.lastActiveAt))
      .limit(24);

    return rows.map((r) => formatRoomSummary(r.room, onlineCounter(r.room.id), r.ownerName));
  } catch (error) {
    console.error('Failed to list open rooms:', error);
    throw new Error('Could not load open rooms.', { cause: error });
  }
}

export async function listRecentRoomsForUser(
  uid: string,
  onlineCounter: (roomId: string) => number
): Promise<RoomSummary[]> {
  try {
    const rows = await db
      .select({
        room: rooms,
        ownerName: users.displayName,
        lastVisitedAt: roomMemberships.lastVisitedAt,
      })
      .from(roomMemberships)
      .innerJoin(rooms, eq(roomMemberships.roomId, rooms.id))
      .innerJoin(users, eq(rooms.ownerUid, users.uid))
      .where(
        and(
          eq(roomMemberships.userUid, uid),
          ne(roomMemberships.joinState, 'banned'),
          ne(rooms.status, 'closed')
        )
      )
      .orderBy(desc(roomMemberships.lastVisitedAt))
      .limit(10);

    return rows.map((r) => formatRoomSummary(r.room, onlineCounter(r.room.id), r.ownerName));
  } catch (error) {
    console.error('Failed to list recent rooms:', error);
    throw new Error('Could not load recently visited worlds.', { cause: error });
  }
}

export async function authorizeRoomJoin(params: {
  room: typeof rooms.$inferSelect;
  userUid: string;
  password?: string;
  reconnectToken?: string;
  activePlayerUids: Set<string>;
}): Promise<{
  role: MemberRole;
  reconnectToken: string;
  lastX: number;
  lastY: number;
  hasSavedPosition: boolean;
}> {
  const { room, userUid, password, reconnectToken, activePlayerUids } = params;

  if (room.status === 'closed') {
    throw new Error('This village room has been closed by the host.');
  }

  try {
    const existingRows = await db
      .select()
      .from(roomMemberships)
      .where(and(eq(roomMemberships.roomId, room.id), eq(roomMemberships.userUid, userUid)))
      .limit(1);
    const existing = existingRows[0];

    // Check active ban
    if (existing?.joinState === 'banned') {
      if (!existing.banExpiresAt || existing.banExpiresAt.getTime() > Date.now()) {
        throw new Error('You have been removed from this village room.');
      }
    }

    // Check valid reconnect token
    const hasValidReconnect = Boolean(
      reconnectToken &&
        existing?.reconnectTokenHash &&
        existing.reconnectExpiresAt &&
        existing.reconnectExpiresAt.getTime() > Date.now() &&
        safeCompareHex(hashToken(reconnectToken), existing.reconnectTokenHash)
    );

    const isOwner = room.ownerUid === userUid;
    const isAlreadySeated = activePlayerUids.has(userUid);

    // Late join enforcement when world already started
    if (room.status === 'active' && !room.allowLateJoin && !isOwner && !hasValidReconnect && !isAlreadySeated) {
      if (!existing || existing.joinState !== 'joined') {
        throw new Error('This village has already started and does not allow late arrivals.');
      }
    }

    // Password check (skip for owner, existing active seat, or valid reconnect credential)
    if (room.passwordHash && !isOwner && !hasValidReconnect && !isAlreadySeated) {
      if (!password || !verifyPassword(password.trim(), room.passwordHash)) {
        const err = new Error('Room password required or incorrect.');
        (err as Error & { code?: string }).code = 'PASSWORD_REQUIRED';
        throw err;
      }
    }

    // Capacity check (10..15) unless already seated
    if (!isAlreadySeated && activePlayerUids.size >= room.capacity) {
      throw new Error(`This village is full (${room.capacity}/${room.capacity} players).`);
    }

    const newReconnectToken = generateSecureId(24);
    const reconnectExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const role: MemberRole = isOwner ? 'host' : ((existing?.role as MemberRole) || 'player');
    const lastX = existing?.lastX ?? SPAWN_TILE.x;
    const lastY = existing?.lastY ?? SPAWN_TILE.y;

    await db
      .insert(roomMemberships)
      .values({
        roomId: room.id,
        userUid,
        role,
        joinState: 'joined',
        reconnectTokenHash: hashToken(newReconnectToken),
        reconnectExpiresAt,
        lastX,
        lastY,
        lastVisitedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [roomMemberships.roomId, roomMemberships.userUid],
        set: {
          role,
          joinState: 'joined',
          reconnectTokenHash: hashToken(newReconnectToken),
          reconnectExpiresAt,
          lastVisitedAt: new Date(),
        },
      });

    return {
      role,
      reconnectToken: newReconnectToken,
      lastX,
      lastY,
      hasSavedPosition: Boolean(existing),
    };
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('full') ||
      error.message.includes('closed') ||
      error.message.includes('removed') ||
      error.message.includes('late arrivals') ||
      error.message.includes('password')
    )) {
      throw error;
    }
    console.error('Failed to authorize room join:', error);
    throw new Error('Could not join room right now.', { cause: error });
  }
}

export async function loadWorldForRoom(roomId: string): Promise<{
  worldId: string;
  width: number;
  height: number;
  chunkSize: number;
  saveVersion: number;
  map: WorldMapData;
  chunks: ChunkRecord[];
}> {
  try {
    const worldRows = await db.select().from(worlds).where(eq(worlds.roomId, roomId)).limit(1);
    if (worldRows.length === 0) {
      throw new Error('World data not found for this room.');
    }
    const world = worldRows[0];
    const chunkRows = await db.select().from(worldChunks).where(eq(worldChunks.worldId, world.id));

    const chunks: ChunkRecord[] = chunkRows.map((ch) => ({
      chunkX: ch.chunkX,
      chunkY: ch.chunkY,
      ground: JSON.parse(ch.groundData) as number[],
      objects: JSON.parse(ch.objectData) as number[],
      revision: ch.revision,
    }));

    const chunkSize = world.chunkSize || CHUNK_SIZE;
    const map =
      chunks.length > 0
        ? unpackChunksToMap(chunks, world.width, world.height, chunkSize)
        : generateStarterVillage(1, world.width, world.height);
    return {
      worldId: world.id,
      width: world.width,
      height: world.height,
      chunkSize,
      saveVersion: world.saveVersion,
      map,
      chunks: chunks.length > 0 ? chunks : packMapToChunks(map, chunkSize),
    };
  } catch (error) {
    console.error('Failed to load world chunks:', error);
    throw new Error('Could not load village world data.', { cause: error });
  }
}

export async function flushDirtyWorldChunks(
  roomId: string,
  worldId: string,
  map: WorldMapData,
  dirtyChunkKeys: Set<string>,
  pendingEdits: PendingEditLog[],
  nextSaveVersion: number,
  chunkSize = CHUNK_SIZE
): Promise<void> {
  if (dirtyChunkKeys.size === 0 && pendingEdits.length === 0) return;

  try {
    const now = new Date();
    for (const key of dirtyChunkKeys) {
      const [cxStr, cyStr] = key.split(',');
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      const g: number[] = [];
      const o: number[] = [];

      for (let ly = 0; ly < chunkSize; ly++) {
        for (let lx = 0; lx < chunkSize; lx++) {
          const wx = cx * chunkSize + lx;
          const wy = cy * chunkSize + ly;
          if (wx < map.width && wy < map.height) {
            const idx = tileIndex(wx, wy, map.width);
            g.push(map.ground[idx] ?? 0);
            o.push(map.objects[idx] ?? 0);
          } else {
            g.push(0);
            o.push(0);
          }
        }
      }

      await db
        .insert(worldChunks)
        .values({
          worldId,
          chunkX: cx,
          chunkY: cy,
          groundData: JSON.stringify(g),
          objectData: JSON.stringify(o),
          revision: nextSaveVersion,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [worldChunks.worldId, worldChunks.chunkX, worldChunks.chunkY],
          set: {
            groundData: JSON.stringify(g),
            objectData: JSON.stringify(o),
            revision: nextSaveVersion,
            updatedAt: now,
          },
        });
    }

    if (pendingEdits.length > 0) {
      await db.insert(worldEdits).values(
        pendingEdits.map((e) => ({
          worldId,
          actorUid: e.actorUid,
          tileX: e.tileX,
          tileY: e.tileY,
          layer: e.layer,
          oldTile: e.oldTile,
          newTile: e.newTile,
        }))
      );
    }

    await db
      .update(worlds)
      .set({ saveVersion: nextSaveVersion, updatedAt: now })
      .where(eq(worlds.id, worldId));

    await db
      .update(rooms)
      .set({ lastActiveAt: now })
      .where(eq(rooms.id, roomId));
  } catch (error) {
    console.error('Failed to flush world chunks:', error);
    throw new Error('Autosave failed.', { cause: error });
  }
}

export async function updateMemberLastPosition(
  roomId: string,
  userUid: string,
  tileX: number,
  tileY: number
): Promise<void> {
  try {
    await db
      .update(roomMemberships)
      .set({
        lastX: Math.round(tileX),
        lastY: Math.round(tileY),
        lastVisitedAt: new Date(),
      })
      .where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userUid, userUid)));
  } catch (error) {
    console.error('Failed to save member last position:', error);
  }
}

export async function updateRoomMetadata(
  roomId: string,
  patch: Partial<{
    name: string;
    visibility: RoomVisibility;
    capacity: number;
    allowLateJoin: boolean;
    buildPolicy: BuildPolicy;
    status: RoomStatus;
    ownerUid: string;
  }>
): Promise<typeof rooms.$inferSelect> {
  const safePatch: Partial<typeof rooms.$inferInsert> = {
    lastActiveAt: new Date(),
  };
  if (patch.name !== undefined) {
    const clean = sanitizePlainText(patch.name, 42);
    if (clean.length >= 2) safePatch.name = clean;
  }
  if (patch.visibility && VALID_VISIBILITIES.has(patch.visibility)) {
    safePatch.visibility = patch.visibility;
  }
  if (typeof patch.capacity === 'number') {
    safePatch.capacity = Math.min(15, Math.max(10, Math.round(patch.capacity)));
  }
  if (typeof patch.allowLateJoin === 'boolean') {
    safePatch.allowLateJoin = patch.allowLateJoin;
  }
  if (patch.buildPolicy && VALID_POLICIES.has(patch.buildPolicy)) {
    safePatch.buildPolicy = patch.buildPolicy;
  }
  if (patch.status) {
    safePatch.status = patch.status;
  }
  if (patch.ownerUid) {
    safePatch.ownerUid = patch.ownerUid;
  }

  try {
    const rows = await db.update(rooms).set(safePatch).where(eq(rooms.id, roomId)).returning();
    if (rows.length === 0) throw new Error('Room not found.');
    return rows[0];
  } catch (error) {
    console.error('Failed to update room metadata:', error);
    throw new Error('Could not update room settings.', { cause: error });
  }
}

export async function recordKickOrBan(
  roomId: string,
  actorUid: string,
  targetUid: string,
  ban: boolean
): Promise<void> {
  try {
    const banExpiresAt = ban ? new Date(Date.now() + 1000 * 60 * 60 * 24) : null;
    await db
      .update(roomMemberships)
      .set({
        joinState: ban ? 'banned' : 'kicked',
        reconnectTokenHash: null,
        reconnectExpiresAt: null,
        banExpiresAt,
      })
      .where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userUid, targetUid)));

    await db.insert(chatModerationLogs).values({
      roomId,
      reporterUid: actorUid,
      targetUid,
      action: ban ? 'ban' : 'kick',
      reason: ban ? 'Banned by host' : 'Removed by host',
    });
  } catch (error) {
    console.error('Failed to record kick/ban:', error);
  }
}

export async function recordHostTransfer(
  roomId: string,
  oldHostUid: string,
  newHostUid: string
): Promise<void> {
  try {
    await db.update(rooms).set({ ownerUid: newHostUid, lastActiveAt: new Date() }).where(eq(rooms.id, roomId));
    await db
      .update(roomMemberships)
      .set({ role: 'player' })
      .where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userUid, oldHostUid)));
    await db
      .update(roomMemberships)
      .set({ role: 'host' })
      .where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userUid, newHostUid)));
  } catch (error) {
    console.error('Failed to transfer host:', error);
    throw new Error('Could not transfer host role.', { cause: error });
  }
}

export async function recordChatReport(
  roomId: string,
  reporterUid: string,
  targetUid: string,
  reason: string
): Promise<void> {
  try {
    await db.insert(chatModerationLogs).values({
      roomId,
      reporterUid,
      targetUid,
      action: 'report',
      reason: sanitizePlainText(reason, 180) || 'Reported by player',
    });
  } catch (error) {
    console.error('Failed to log report:', error);
  }
}

export async function deleteRoomOwnedBy(roomId: string, ownerUid: string): Promise<boolean> {
  try {
    const deleted = await db
      .delete(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.ownerUid, ownerUid)))
      .returning({ id: rooms.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Failed to delete room:', error);
    throw new Error('Could not delete village room.', { cause: error });
  }
}

export async function loadUsersByUids(uids: string[]): Promise<Map<string, typeof users.$inferSelect>> {
  const out = new Map<string, typeof users.$inferSelect>();
  if (uids.length === 0) return out;
  try {
    const rows = await db.select().from(users).where(inArray(users.uid, uids));
    for (const row of rows) {
      out.set(row.uid, row);
    }
    return out;
  } catch (error) {
    console.error('Failed to fetch user batch:', error);
    return out;
  }
}

export async function loadAdventureProgress(roomId: string): Promise<AdventureState> {
  try {
    const rows = await db
      .select()
      .from(adventureProgress)
      .where(eq(adventureProgress.roomId, roomId))
      .limit(1);
    if (rows.length === 0) {
      const fresh = createInitialAdventureState();
      await db
        .insert(adventureProgress)
        .values({
          roomId,
          chapterId: fresh.chapterId,
          stateJson: JSON.stringify(fresh),
        })
        .onConflictDoNothing();
      return fresh;
    }
    return normalizeAdventureState(JSON.parse(rows[0].stateJson));
  } catch (error) {
    console.error('Failed to load adventure progress:', error);
    return createInitialAdventureState();
  }
}

export async function saveAdventureProgress(roomId: string, state: AdventureState): Promise<void> {
  try {
    const now = new Date();
    const json = JSON.stringify(state);
    await db
      .insert(adventureProgress)
      .values({
        roomId,
        chapterId: state.chapterId,
        stateJson: json,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [adventureProgress.roomId],
        set: {
          chapterId: state.chapterId,
          stateJson: json,
          updatedAt: now,
        },
      });
  } catch (error) {
    console.error('Failed to save adventure progress:', error);
  }
}
