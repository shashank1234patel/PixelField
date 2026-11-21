import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ADVENTURE_CLUES,
  ADVENTURE_ITEMS,
  ADVENTURE_QUESTS,
  type AdventureNodeDef,
  type AdventureNotification,
  type AdventureState,
  DIAL_CHEST_CODE,
  EMBLEM_SEQUENCE_SOLUTION,
  type QuestId,
  getAdventureNodesForMap,
} from '../shared/adventureData.ts';
import {
  type ChatMessagePayload,
  type ClientEvent,
  type FacingDir,
  type MemberRole,
  PROTOCOL_VERSION,
  type RoomPlayerState,
  type RoomSummary,
  type ServerEvent,
  type UserProfile,
} from '../shared/protocol.ts';
import { type WorldMapData, packMapToChunks } from '../shared/starterMap.ts';
import {
  ALLOWED_GROUND_TILES,
  ALLOWED_OBJECT_TILES,
  ObjectTile,
  getSpawnPoints,
  isInBuildZone,
  isProtectedLandmarkTile,
  isTileSolid,
  tileIndex,
} from '../shared/tiles.ts';
import { resolveUserFromHeaders } from './authService.ts';
import { generateSecureId, sanitizePlainText } from './crypto.ts';
import {
  type PendingEditLog,
  authorizeRoomJoin,
  flushDirtyWorldChunks,
  formatRoomSummary,
  getRoomByIdOrCode,
  loadAdventureProgress,
  loadWorldForRoom,
  recordChatReport,
  recordHostTransfer,
  recordKickOrBan,
  saveAdventureProgress,
  updateMemberLastPosition,
  updateRoomMetadata,
} from './worldPersistence.ts';

interface UndoEntry {
  tileX: number;
  tileY: number;
  layer: 'ground' | 'object';
  oldTile: number;
  newTile: number;
}

interface ConnectedPlayer {
  uid: string;
  displayName: string;
  avatarColor: string;
  hatStyle: UserProfile['hatStyle'];
  role: MemberRole;
  ready: boolean;
  connected: boolean;
  socket: WebSocket | null;
  x: number;
  y: number;
  facing: FacingDir;
  walking: boolean;
  seq: number;
  dirtyMove: boolean;
  lastMoveAt: number;
  lastPongAt: number;
  disconnectTimer: NodeJS.Timeout | null;
  chatTimestamps: number[];
  editTimestamps: number[];
  undoStack: UndoEntry[];
}

interface ActiveRoomSession {
  room: RoomSummary;
  worldId: string;
  chunkSize: number;
  saveVersion: number;
  map: WorldMapData;
  adventure: AdventureState;
  adventureNodes: AdventureNodeDef[];
  plateLatchUntil: {
    plateA: number;
    plateB: number;
  };
  players: Map<string, ConnectedPlayer>;
  recentChat: ChatMessagePayload[];
  dirtyChunks: Set<string>;
  pendingEdits: PendingEditLog[];
  flushTimer: NodeJS.Timeout | null;
  tickTimer: NodeJS.Timeout | null;
  emptyCleanupTimer: NodeJS.Timeout | null;
}

const VALID_FACING = new Set<FacingDir>(['down', 'up', 'left', 'right']);
const MAX_EDIT_RANGE = 6.5;
const MAX_SPEED_TILES_PER_SEC = 9.5;
const RECONNECT_GRACE_MS = 90_000;
const AUTOSAVE_INTERVAL_MS = 3_000;
const TICK_INTERVAL_MS = 66; // ~15 Hz state updates
const HEARTBEAT_INTERVAL_MS = 15_000;

export class RealtimeRoomManager {
  private sessions = new Map<string, ActiveRoomSession>();
  private wss: WebSocketServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public attach(httpServer: HttpServer) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      maxPayload: 32 * 1024,
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.heartbeatInterval = setInterval(() => {
      this.runHeartbeatSweep();
    }, HEARTBEAT_INTERVAL_MS);
  }

  public getOnlineCount(roomId: string): number {
    const session = this.sessions.get(roomId);
    if (!session) return 0;
    let count = 0;
    for (const p of session.players.values()) {
      if (p.connected) count++;
    }
    return count;
  }

  public getSeatedUids(roomId: string): Set<string> {
    const session = this.sessions.get(roomId);
    if (!session) return new Set();
    return new Set(session.players.keys());
  }

  public updateUserProfileLive(user: UserProfile) {
    for (const session of this.sessions.values()) {
      const player = session.players.get(user.uid);
      if (player) {
        player.displayName = user.displayName;
        player.avatarColor = user.avatarColor;
        player.hatStyle = user.hatStyle;
        this.broadcast(session, {
          v: PROTOCOL_VERSION,
          type: 'player.joined',
          player: this.toPublicPlayer(player),
        });
      }
    }
  }

  public async shutdown() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    const flushPromises: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      if (session.tickTimer) clearInterval(session.tickTimer);
      if (session.flushTimer) clearTimeout(session.flushTimer);
      if (session.emptyCleanupTimer) clearTimeout(session.emptyCleanupTimer);
      flushPromises.push(this.flushSession(session));
    }
    await Promise.allSettled(flushPromises);
    this.wss?.close();
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    let attachedRoomId: string | null = null;
    let attachedUid: string | null = null;
    let resolvedUser: UserProfile | null = null;
    let authFinished = false;
    let closedEarly = false;
    const queuedMessages: string[] = [];

    const helloTimeout = setTimeout(() => {
      if (!attachedRoomId && ws.readyState === WebSocket.OPEN) {
        ws.close(4008, 'Handshake timeout');
      }
    }, 10_000);

    const processRawMessage = async (rawStr: string) => {
      if (!resolvedUser) return;
      const user = resolvedUser;
      let msg: ClientEvent;
      try {
        msg = JSON.parse(rawStr) as ClientEvent;
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'ping') {
        if (attachedRoomId && attachedUid) {
          const s = this.sessions.get(attachedRoomId);
          const p = s?.players.get(attachedUid);
          if (p) p.lastPongAt = Date.now();
        }
        this.send(ws, { v: PROTOCOL_VERSION, type: 'pong', ts: Number(msg.ts) || Date.now() });
        return;
      }

      if (msg.type === 'auth.hello') {
        clearTimeout(helloTimeout);
        if (attachedRoomId) return;
        try {
          const joined = await this.joinSession(ws, user, msg.roomId, msg.reconnectToken);
          attachedRoomId = joined.roomId;
          attachedUid = user.uid;
        } catch (err) {
          this.send(ws, {
            v: PROTOCOL_VERSION,
            type: 'error',
            code: 'JOIN_FAILED',
            message: err instanceof Error ? err.message : 'Unable to connect to room.',
          });
          ws.close(4003, 'Join rejected');
        }
        return;
      }

      if (!attachedRoomId || !attachedUid) return;
      const session = this.sessions.get(attachedRoomId);
      if (!session) return;
      const player = session.players.get(attachedUid);
      if (!player) return;

      player.lastPongAt = Date.now();

      switch (msg.type) {
        case 'room.ready':
          this.handleReady(session, player, Boolean(msg.ready));
          break;
        case 'room.start':
          await this.handleStartRoom(session, player);
          break;
        case 'room.close':
          await this.handleCloseRoom(session, player);
          break;
        case 'room.updateSettings':
          await this.handleUpdateSettings(session, player, msg);
          break;
        case 'room.kick':
          await this.handleKick(session, player, msg.targetUid, Boolean(msg.ban));
          break;
        case 'room.transferHost':
          await this.handleTransferHost(session, player, msg.targetUid);
          break;
        case 'player.move':
          this.handleMove(session, player, msg);
          break;
        case 'world.editRequest':
          this.handleWorldEdit(session, player, msg);
          break;
        case 'world.undoRequest':
          this.handleUndo(session, player);
          break;
        case 'adventure.interact':
          await this.handleAdventureInteract(session, player, msg.nodeId);
          break;
        case 'adventure.solvePuzzle':
          await this.handleAdventureSolvePuzzle(session, player, msg.nodeId, msg.answer);
          break;
        case 'chat.send':
          this.handleChat(session, player, msg.text);
          break;
        case 'chat.report':
          await this.handleReport(session, player, msg.targetUid, msg.reason);
          break;
      }
    };

    // Attach listeners synchronously BEFORE awaiting database/Firebase verification
    ws.on('message', (raw) => {
      const str = raw.toString();
      if (!authFinished) {
        if (queuedMessages.length < 16) queuedMessages.push(str);
        return;
      }
      void processRawMessage(str);
    });

    ws.on('close', () => {
      closedEarly = true;
      clearTimeout(helloTimeout);
      if (attachedRoomId && attachedUid) {
        this.handleDisconnect(attachedRoomId, attachedUid, ws);
      }
    });

    ws.on('error', () => {
      closedEarly = true;
      clearTimeout(helloTimeout);
    });

    // Resolve identity asynchronously, then drain any buffered handshake messages
    const url = new URL(req.url || '/ws', 'http://localhost');
    const idTokenParam = url.searchParams.get('idToken');
    const authHeader = idTokenParam ? `Bearer ${idTokenParam}` : req.headers.authorization;

    void resolveUserFromHeaders(authHeader, req.headers.cookie).then(async (user) => {
      if (closedEarly) return;
      if (!user) {
        authFinished = true;
        this.send(ws, {
          v: PROTOCOL_VERSION,
          type: 'error',
          code: 'UNAUTHORIZED',
          message: 'Session expired. Please sign in or enter as a guest.',
        });
        ws.close(4001, 'Unauthorized');
        return;
      }
      resolvedUser = user;
      authFinished = true;
      while (queuedMessages.length > 0 && !closedEarly) {
        const next = queuedMessages.shift()!;
        await processRawMessage(next);
      }
    });
  }

  private async ensureSessionLoaded(roomId: string): Promise<ActiveRoomSession> {
    const existing = this.sessions.get(roomId);
    if (existing) {
      if (existing.emptyCleanupTimer) {
        clearTimeout(existing.emptyCleanupTimer);
        existing.emptyCleanupTimer = null;
      }
      return existing;
    }

    const roomRow = await getRoomByIdOrCode(roomId);
    if (!roomRow) {
      throw new Error('Room not found.');
    }
    if (roomRow.status === 'closed') {
      throw new Error('This room has been closed by the host.');
    }

    const [worldData, adventure] = await Promise.all([
      loadWorldForRoom(roomRow.id),
      loadAdventureProgress(roomRow.id),
    ]);
    const adventureNodes = getAdventureNodesForMap(worldData.map.width, worldData.map.height);

    // Ensure world tiles match persisted adventure state (opened chests, hidden door, collected satchels)
    for (const node of adventureNodes) {
      if (node.x < 0 || node.x >= worldData.map.width || node.y < 0 || node.y >= worldData.map.height) {
        continue;
      }
      const idx = tileIndex(node.x, node.y, worldData.map.width);
      if (node.kind === 'hidden_door') {
        worldData.map.objects[idx] = adventure.hiddenDoorOpen
          ? ObjectTile.HIDDEN_DOOR_OPEN
          : ObjectTile.HIDDEN_DOOR_CLOSED;
      } else if (node.kind === 'chest' && adventure.openedChests.includes(node.id)) {
        worldData.map.objects[idx] = ObjectTile.CHEST_OPENED;
      } else if (
        (node.kind === 'satchel' || node.kind === 'curio') &&
        node.itemId &&
        adventure.collectedItems.includes(node.itemId)
      ) {
        worldData.map.objects[idx] = ObjectTile.NONE;
      }
    }

    const session: ActiveRoomSession = {
      room: formatRoomSummary(roomRow, 0),
      worldId: worldData.worldId,
      chunkSize: worldData.chunkSize,
      saveVersion: worldData.saveVersion,
      map: worldData.map,
      adventure,
      adventureNodes,
      plateLatchUntil: { plateA: 0, plateB: 0 },
      players: new Map(),
      recentChat: [],
      dirtyChunks: new Set(),
      pendingEdits: [],
      flushTimer: null,
      tickTimer: null,
      emptyCleanupTimer: null,
    };

    session.tickTimer = setInterval(() => {
      this.broadcastMovementTick(session);
      this.evaluatePressurePlates(session);
    }, TICK_INTERVAL_MS);

    this.sessions.set(roomRow.id, session);
    return session;
  }

  private async joinSession(
    ws: WebSocket,
    user: UserProfile,
    roomId: string,
    reconnectToken?: string
  ): Promise<{ roomId: string }> {
    const roomRow = await getRoomByIdOrCode(roomId);
    if (!roomRow) {
      throw new Error('Room not found.');
    }

    const session = await this.ensureSessionLoaded(roomRow.id);
    const seatedUids = new Set(session.players.keys());
    const authResult = await authorizeRoomJoin({
      room: roomRow,
      userUid: user.uid,
      reconnectToken,
      activePlayerUids: seatedUids,
    });

    const existingPlayer = session.players.get(user.uid);
    let player: ConnectedPlayer;
    let isReconnect = false;

    if (existingPlayer) {
      // Reconnect to the exact same player seat without duplicating!
      isReconnect = true;
      if (existingPlayer.disconnectTimer) {
        clearTimeout(existingPlayer.disconnectTimer);
        existingPlayer.disconnectTimer = null;
      }
      if (existingPlayer.socket && existingPlayer.socket !== ws && existingPlayer.socket.readyState === WebSocket.OPEN) {
        existingPlayer.socket.close(4009, 'Connected from another tab');
      }
      existingPlayer.socket = ws;
      existingPlayer.connected = true;
      existingPlayer.displayName = user.displayName;
      existingPlayer.avatarColor = user.avatarColor;
      existingPlayer.hatStyle = user.hatStyle;
      existingPlayer.role = authResult.role;
      existingPlayer.lastPongAt = Date.now();
      player = existingPlayer;
    } else {
      const safeSpawn = this.findSafeSpawn(
        session,
        authResult.lastX,
        authResult.lastY,
        authResult.hasSavedPosition
      );
      player = {
        uid: user.uid,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
        hatStyle: user.hatStyle,
        role: authResult.role,
        ready: authResult.role === 'host',
        connected: true,
        socket: ws,
        x: safeSpawn.x,
        y: safeSpawn.y,
        facing: 'down',
        walking: false,
        seq: 0,
        dirtyMove: false,
        lastMoveAt: Date.now(),
        lastPongAt: Date.now(),
        disconnectTimer: null,
        chatTimestamps: [],
        editTimestamps: [],
        undoStack: [],
      };
      session.players.set(user.uid, player);
    }

    session.room.onlineCount = this.getOnlineCount(session.room.id);

    // Send full authoritative room & world snapshot to joining client
    const chunks = packMapToChunks(session.map, session.chunkSize);
    this.send(ws, {
      v: PROTOCOL_VERSION,
      type: 'room.snapshot',
      room: session.room,
      selfUid: user.uid,
      reconnectToken: authResult.reconnectToken,
      players: Array.from(session.players.values()).map((p) => this.toPublicPlayer(p)),
      world: {
        width: session.map.width,
        height: session.map.height,
        chunkSize: session.chunkSize,
        saveVersion: session.saveVersion,
        chunks,
      },
      recentChat: session.recentChat,
      adventure: session.adventure,
      canUndo: player.undoStack.length > 0,
    });

    if (isReconnect) {
      this.broadcast(
        session,
        {
          v: PROTOCOL_VERSION,
          type: 'player.presence',
          uid: player.uid,
          connected: true,
          ready: player.ready,
          role: player.role,
        },
        user.uid
      );
      this.pushSystemNotice(session, `${player.displayName} reconnected to the village.`);
    } else {
      this.broadcast(
        session,
        {
          v: PROTOCOL_VERSION,
          type: 'player.joined',
          player: this.toPublicPlayer(player),
        },
        user.uid
      );
      this.pushSystemNotice(session, `${player.displayName} arrived in the village.`);
    }

    return { roomId: session.room.id };
  }

  private findSafeSpawn(
    session: ActiveRoomSession,
    preferX: number,
    preferY: number,
    preferSaved: boolean
  ): { x: number; y: number } {
    const { map } = session;
    const isWalkable = (ix: number, iy: number) => {
      if (ix < 1 || ix >= map.width - 1 || iy < 1 || iy >= map.height - 1) return false;
      const idx = tileIndex(ix, iy, map.width);
      return !isTileSolid(map.ground[idx], map.objects[idx]);
    };
    const isOccupied = (ix: number, iy: number) => {
      for (const p of session.players.values()) {
        if (!p.connected) continue;
        if (Math.hypot(p.x - ix, p.y - iy) < 1.2) return true;
      }
      return false;
    };

    if (preferSaved) {
      const ix = Math.round(preferX);
      const iy = Math.round(preferY);
      if (isWalkable(ix, iy) && !isOccupied(ix, iy)) {
        return { x: ix, y: iy };
      }
    }

    const spawnRing = getSpawnPoints(map.width, map.height);
    for (const pt of spawnRing) {
      if (isWalkable(pt.x, pt.y) && !isOccupied(pt.x, pt.y)) {
        return { x: pt.x, y: pt.y };
      }
    }
    for (const pt of spawnRing) {
      if (isWalkable(pt.x, pt.y)) {
        return { x: pt.x, y: pt.y };
      }
    }
    return spawnRing[0] ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
  }

  private handleDisconnect(roomId: string, uid: string, ws: WebSocket) {
    const session = this.sessions.get(roomId);
    if (!session) return;
    const player = session.players.get(uid);
    if (!player || player.socket !== ws) return;

    player.socket = null;
    player.connected = false;
    player.walking = false;
    session.room.onlineCount = this.getOnlineCount(roomId);

    void updateMemberLastPosition(roomId, uid, player.x, player.y);

    this.broadcast(session, {
      v: PROTOCOL_VERSION,
      type: 'player.presence',
      uid: player.uid,
      connected: false,
      ready: player.ready,
      role: player.role,
    });

    // Hold seat briefly so page refresh or brief network drop restores exact seat
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
      if (!player.connected) {
        session.players.delete(uid);
        session.room.onlineCount = this.getOnlineCount(roomId);
        this.broadcast(session, {
          v: PROTOCOL_VERSION,
          type: 'player.left',
          uid,
          permanent: true,
        });
        this.pushSystemNotice(session, `${player.displayName} left the village.`);

        // Auto-promote another connected player if host permanently left
        if (player.role === 'host') {
          const nextHost = Array.from(session.players.values()).find((p) => p.connected);
          if (nextHost) {
            nextHost.role = 'host';
            session.room.ownerUid = nextHost.uid;
            void recordHostTransfer(roomId, uid, nextHost.uid);
            this.broadcast(session, {
              v: PROTOCOL_VERSION,
              type: 'player.presence',
              uid: nextHost.uid,
              connected: nextHost.connected,
              ready: nextHost.ready,
              role: 'host',
            });
            this.broadcast(session, {
              v: PROTOCOL_VERSION,
              type: 'room.settingsChanged',
              room: session.room,
            });
            this.pushSystemNotice(session, `${nextHost.displayName} is now the village host.`);
          }
        }

        // Flush and schedule unload if everyone is gone
        if (session.players.size === 0) {
          void this.flushSession(session);
          session.emptyCleanupTimer = setTimeout(() => {
            if (session.players.size === 0) {
              if (session.tickTimer) clearInterval(session.tickTimer);
              if (session.flushTimer) clearTimeout(session.flushTimer);
              this.sessions.delete(roomId);
            }
          }, 30_000);
        }
      }
    }, RECONNECT_GRACE_MS);

    // Trigger immediate flush when nobody is actively connected
    if (session.room.onlineCount === 0) {
      void this.flushSession(session);
    }
  }

  private handleReady(session: ActiveRoomSession, player: ConnectedPlayer, ready: boolean) {
    player.ready = ready;
    this.broadcast(session, {
      v: PROTOCOL_VERSION,
      type: 'player.presence',
      uid: player.uid,
      connected: player.connected,
      ready: player.ready,
      role: player.role,
    });
  }

  private async handleStartRoom(session: ActiveRoomSession, player: ConnectedPlayer) {
    if (player.role !== 'host') {
      this.sendError(player.socket, 'FORBIDDEN', 'Only the host can start the village.');
      return;
    }
    if (session.room.status === 'active') return;
    try {
      const updated = await updateRoomMetadata(session.room.id, { status: 'active' });
      session.room = formatRoomSummary(updated, this.getOnlineCount(session.room.id));
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'room.settingsChanged',
        room: session.room,
      });
      this.pushSystemNotice(session, `${player.displayName} opened the village gates!`);
    } catch (err) {
      this.sendError(player.socket, 'SERVER_ERROR', (err as Error).message);
    }
  }

  private async handleCloseRoom(session: ActiveRoomSession, player: ConnectedPlayer) {
    if (player.role !== 'host') {
      this.sendError(player.socket, 'FORBIDDEN', 'Only the host can close the room.');
      return;
    }
    try {
      await this.flushSession(session);
      await updateRoomMetadata(session.room.id, { status: 'closed' });
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'room.closed',
        reason: 'The host has closed this village room.',
      });
      for (const p of session.players.values()) {
        if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
        p.socket?.close(4000, 'Room closed');
      }
      if (session.tickTimer) clearInterval(session.tickTimer);
      if (session.flushTimer) clearTimeout(session.flushTimer);
      this.sessions.delete(session.room.id);
    } catch (err) {
      this.sendError(player.socket, 'SERVER_ERROR', (err as Error).message);
    }
  }

  private async handleUpdateSettings(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    msg: Extract<ClientEvent, { type: 'room.updateSettings' }>
  ) {
    if (player.role !== 'host') {
      this.sendError(player.socket, 'FORBIDDEN', 'Only the host can adjust room settings.');
      return;
    }
    try {
      const updated = await updateRoomMetadata(session.room.id, {
        name: msg.name,
        visibility: msg.visibility,
        capacity: msg.capacity,
        allowLateJoin: msg.allowLateJoin,
        buildPolicy: msg.buildPolicy,
      });
      session.room = formatRoomSummary(updated, this.getOnlineCount(session.room.id));
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'room.settingsChanged',
        room: session.room,
      });
    } catch (err) {
      this.sendError(player.socket, 'SERVER_ERROR', (err as Error).message);
    }
  }

  private async handleKick(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    targetUid: string,
    ban: boolean
  ) {
    if (player.role !== 'host') {
      this.sendError(player.socket, 'FORBIDDEN', 'Only the host can remove participants.');
      return;
    }
    if (targetUid === player.uid) return;
    const target = session.players.get(targetUid);
    if (!target) return;

    await recordKickOrBan(session.room.id, player.uid, targetUid, ban);

    if (target.disconnectTimer) clearTimeout(target.disconnectTimer);
    if (target.socket && target.socket.readyState === WebSocket.OPEN) {
      this.send(target.socket, {
        v: PROTOCOL_VERSION,
        type: 'room.kicked',
        reason: ban
          ? 'You were removed and banned from this village by the host.'
          : 'You were removed from this village by the host.',
      });
      target.socket.close(4004, 'Removed by host');
    }

    session.players.delete(targetUid);
    session.room.onlineCount = this.getOnlineCount(session.room.id);
    this.broadcast(session, {
      v: PROTOCOL_VERSION,
      type: 'player.left',
      uid: targetUid,
      permanent: true,
    });
    this.pushSystemNotice(session, `${target.displayName} was removed by the host.`);
  }

  private async handleTransferHost(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    targetUid: string
  ) {
    if (player.role !== 'host' || targetUid === player.uid) return;
    const target = session.players.get(targetUid);
    if (!target) return;

    try {
      await recordHostTransfer(session.room.id, player.uid, targetUid);
      player.role = 'player';
      target.role = 'host';
      session.room.ownerUid = targetUid;

      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'player.presence',
        uid: player.uid,
        connected: player.connected,
        ready: player.ready,
        role: 'player',
      });
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'player.presence',
        uid: target.uid,
        connected: target.connected,
        ready: target.ready,
        role: 'host',
      });
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'room.settingsChanged',
        room: session.room,
      });
      this.pushSystemNotice(session, `${target.displayName} is now the village host.`);
    } catch (err) {
      this.sendError(player.socket, 'SERVER_ERROR', (err as Error).message);
    }
  }

  private handleMove(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    msg: Extract<ClientEvent, { type: 'player.move' }>
  ) {
    if (session.room.status !== 'active') return;
    const targetX = Number(msg.x);
    const targetY = Number(msg.y);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

    const now = Date.now();
    const dtSec = Math.max(0.05, Math.min(1.0, (now - player.lastMoveAt) / 1000));
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dist = Math.hypot(dx, dy);

    // Bounds check
    const clampedX = Math.max(0.5, Math.min(session.map.width - 1.5, targetX));
    const clampedY = Math.max(0.5, Math.min(session.map.height - 1.5, targetY));

    // Anti-speed-hack / teleport check
    const maxStep = Math.max(1.2, MAX_SPEED_TILES_PER_SEC * dtSec);
    let acceptedX = clampedX;
    let acceptedY = clampedY;

    if (dist > maxStep) {
      // Bounded correction back toward last authoritative position
      const ratio = maxStep / dist;
      acceptedX = player.x + dx * ratio;
      acceptedY = player.y + dy * ratio;
    }

    // Collision check on bounding corners around player feet (radius 0.28 tile)
    if (this.collidesWithWorld(session.map, acceptedX, acceptedY)) {
      // Try sliding along X or Y axis independently
      if (!this.collidesWithWorld(session.map, acceptedX, player.y)) {
        acceptedY = player.y;
      } else if (!this.collidesWithWorld(session.map, player.x, acceptedY)) {
        acceptedX = player.x;
      } else {
        acceptedX = player.x;
        acceptedY = player.y;
      }
    }

    const facing: FacingDir = VALID_FACING.has(msg.facing) ? msg.facing : player.facing;
    const walking = Boolean(msg.walking);

    const changed =
      Math.abs(acceptedX - player.x) > 0.002 ||
      Math.abs(acceptedY - player.y) > 0.002 ||
      facing !== player.facing ||
      walking !== player.walking;

    player.x = acceptedX;
    player.y = acceptedY;
    player.facing = facing;
    player.walking = walking;
    player.seq = Number(msg.seq) || player.seq + 1;
    player.lastMoveAt = now;

    if (changed) {
      player.dirtyMove = true;
    }
  }

  private collidesWithWorld(map: WorldMapData, x: number, y: number): boolean {
    const r = 0.28;
    const samplePoints: Array<[number, number]> = [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ];
    for (const [sx, sy] of samplePoints) {
      const tx = Math.floor(sx + 0.5);
      const ty = Math.floor(sy + 0.5);
      if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return true;
      const idx = tileIndex(tx, ty, map.width);
      if (isTileSolid(map.ground[idx], map.objects[idx])) {
        return true;
      }
    }
    return false;
  }

  private handleWorldEdit(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    msg: Extract<ClientEvent, { type: 'world.editRequest' }>
  ) {
    const tileX = Math.floor(Number(msg.tileX));
    const tileY = Math.floor(Number(msg.tileY));
    const layer = msg.layer === 'ground' ? 'ground' : 'object';
    const tileId = Math.floor(Number(msg.tileId));

    const { width, height } = session.map;

    const reject = (reason: string) => {
      const currentTileId =
        tileX >= 0 && tileX < width && tileY >= 0 && tileY < height
          ? layer === 'ground'
            ? session.map.ground[tileIndex(tileX, tileY, width)]
            : session.map.objects[tileIndex(tileX, tileY, width)]
          : 0;
      this.send(player.socket, {
        v: PROTOCOL_VERSION,
        type: 'world.editRejected',
        requestId: msg.requestId,
        tileX,
        tileY,
        layer,
        currentTileId,
        reason,
      });
    };

    if (session.room.status !== 'active') {
      return reject('Wait for the host to start the village before building.');
    }

    // Rate limit: max 12 edits per second
    const now = Date.now();
    player.editTimestamps = player.editTimestamps.filter((t) => now - t < 1000);
    if (player.editTimestamps.length >= 12) {
      return reject('Building too fast — slow down slightly.');
    }

    // Bounds check
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
      return reject('Outside village bounds.');
    }

    // Build permission policy
    if (session.room.buildPolicy === 'host_only' && player.role === 'player') {
      return reject('Only the host can build in this village.');
    }
    if (
      session.room.buildPolicy === 'build_zones' &&
      player.role === 'player' &&
      !isInBuildZone(tileX, tileY, width, height)
    ) {
      return reject('Building is restricted to the marked neighborhood build zones.');
    }

    // Protect spawn pad and central well landmarks
    if (isProtectedLandmarkTile(tileX, tileY, width, height)) {
      return reject('Village landmarks and the central well are protected.');
    }

    // Reach range check
    const dist = Math.hypot(tileX - player.x, tileY - player.y);
    if (dist > MAX_EDIT_RANGE) {
      return reject('Move closer to build or clear that tile.');
    }

    // Validate tile ID allow-list
    if (layer === 'ground' && !ALLOWED_GROUND_TILES.has(tileId)) {
      return reject('Invalid ground tile selected.');
    }
    if (layer === 'object' && !ALLOWED_OBJECT_TILES.has(tileId)) {
      return reject('Invalid object tile selected.');
    }

    const idx = tileIndex(tileX, tileY, width);
    const nextGround = layer === 'ground' ? tileId : session.map.ground[idx];
    const nextObj = layer === 'object' ? tileId : session.map.objects[idx];

    // Prevent placing a solid tile directly on top of any connected player
    if (isTileSolid(nextGround, nextObj)) {
      for (const p of session.players.values()) {
        if (!p.connected) continue;
        if (Math.hypot(p.x - tileX, p.y - tileY) < 0.72) {
          return reject('Cannot place a solid tile where a villager is standing.');
        }
      }
    }

    const oldTile = layer === 'ground' ? session.map.ground[idx] : session.map.objects[idx];
    if (oldTile === tileId) return;

    player.editTimestamps.push(now);
    this.applyTileChange(session, player, tileX, tileY, layer, oldTile, tileId, msg.requestId, true);
  }

  private handleUndo(session: ActiveRoomSession, player: ConnectedPlayer) {
    if (session.room.status !== 'active') return;
    const entry = player.undoStack.pop();
    if (!entry) return;

    const idx = tileIndex(entry.tileX, entry.tileY, session.map.width);
    const currentTile =
      entry.layer === 'ground' ? session.map.ground[idx] : session.map.objects[idx];
    if (currentTile === entry.oldTile) return;

    this.applyTileChange(
      session,
      player,
      entry.tileX,
      entry.tileY,
      entry.layer,
      currentTile,
      entry.oldTile,
      undefined,
      false
    );
  }

  private applyTileChange(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    tileX: number,
    tileY: number,
    layer: 'ground' | 'object',
    oldTile: number,
    newTile: number,
    requestId: string | undefined,
    pushToUndo: boolean
  ) {
    const idx = tileIndex(tileX, tileY, session.map.width);
    if (layer === 'ground') {
      session.map.ground[idx] = newTile;
    } else {
      session.map.objects[idx] = newTile;
    }

    if (pushToUndo) {
      player.undoStack.push({ tileX, tileY, layer, oldTile, newTile });
      if (player.undoStack.length > 15) {
        player.undoStack.shift();
      }
    }

    session.saveVersion += 1;
    const chunkX = Math.floor(tileX / session.chunkSize);
    const chunkY = Math.floor(tileY / session.chunkSize);
    session.dirtyChunks.add(`${chunkX},${chunkY}`);
    session.pendingEdits.push({
      actorUid: player.uid,
      tileX,
      tileY,
      layer,
      oldTile,
      newTile,
    });

    this.scheduleAutosave(session);

    // Broadcast authoritative change to everyone
    for (const p of session.players.values()) {
      if (!p.socket || p.socket.readyState !== WebSocket.OPEN) continue;
      this.send(p.socket, {
        v: PROTOCOL_VERSION,
        type: 'world.editAccepted',
        requestId: p.uid === player.uid ? requestId : undefined,
        actorUid: player.uid,
        tileX,
        tileY,
        layer,
        tileId: newTile,
        saveVersion: session.saveVersion,
        canUndo: p.uid === player.uid ? player.undoStack.length > 0 : undefined,
      });
    }
  }

  private setAdventureMapObjectTile(
    session: ActiveRoomSession,
    actorUid: string,
    tileX: number,
    tileY: number,
    newTile: number
  ) {
    if (tileX < 0 || tileX >= session.map.width || tileY < 0 || tileY >= session.map.height) return;
    const idx = tileIndex(tileX, tileY, session.map.width);
    const oldTile = session.map.objects[idx];
    if (oldTile === newTile) return;

    session.map.objects[idx] = newTile;
    session.saveVersion += 1;
    const chunkX = Math.floor(tileX / session.chunkSize);
    const chunkY = Math.floor(tileY / session.chunkSize);
    session.dirtyChunks.add(`${chunkX},${chunkY}`);
    session.pendingEdits.push({
      actorUid,
      tileX,
      tileY,
      layer: 'object',
      oldTile,
      newTile,
    });
    this.scheduleAutosave(session);

    this.broadcast(session, {
      v: PROTOCOL_VERSION,
      type: 'world.editAccepted',
      actorUid,
      tileX,
      tileY,
      layer: 'object',
      tileId: newTile,
      saveVersion: session.saveVersion,
    });
  }

  private pushAdventureNotification(
    session: ActiveRoomSession,
    actorName: string,
    kind: AdventureNotification['kind'],
    title: string,
    detail: string
  ) {
    const now = Date.now();
    const notification: AdventureNotification = {
      id: generateSecureId(8),
      actorName,
      kind,
      title,
      detail,
      timestamp: now,
    };
    session.adventure.recentDiscoveries.push({
      id: notification.id,
      actorName,
      text: `${title} — ${detail}`,
      timestamp: now,
    });
    if (session.adventure.recentDiscoveries.length > 20) {
      session.adventure.recentDiscoveries.shift();
    }
    this.broadcast(session, {
      v: PROTOCOL_VERSION,
      type: 'adventure.notification',
      notification,
    });
    this.pushSystemNotice(session, `${actorName}: ${title} (${detail})`);
  }

  private addUnique<T>(arr: T[], value: T): boolean {
    if (arr.includes(value)) return false;
    arr.push(value);
    return true;
  }

  private completeQuestIfNew(
    session: ActiveRoomSession,
    questId: QuestId,
    actorName: string
  ): boolean {
    if (!this.addUnique(session.adventure.completedQuests, questId)) return false;
    const quest = ADVENTURE_QUESTS.find((q) => q.id === questId);
    if (quest) {
      this.pushAdventureNotification(
        session,
        actorName,
        'quest',
        `Quest Completed: ${quest.title}`,
        `Reward: ${quest.rewardSummary}`
      );
    }
    return true;
  }

  private async handleAdventureInteract(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    nodeId: string
  ) {
    if (session.room.status !== 'active') return;
    const node = session.adventureNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const dist = Math.hypot(player.x - node.x, player.y - node.y);
    if (dist > 4.2) {
      this.sendError(player.socket, 'OUT_OF_RANGE', `Walk closer to inspect ${node.name}.`);
      return;
    }

    const adv = session.adventure;
    let stateChanged = false;

    if (this.addUnique(adv.inspectedNodes, node.id)) {
      stateChanged = true;
    }

    // 1. Quest 1: Central Well
    if (node.id === 'plaza_well') {
      const addedClue = this.addUnique(adv.discoveredClues, 'clue_plaza_well');
      const addedRibbon = this.addUnique(adv.collectedItems, 'brass_ribbon');
      if (addedClue || addedRibbon) {
        stateChanged = true;
        this.completeQuestIfNew(session, 'q1_well_notice', player.displayName);
      }
    }

    // 2. Quest 2: Clara's 3 Lost Seed Satchels
    else if (
      node.id === 'herb_satchel_1' ||
      node.id === 'herb_satchel_2' ||
      node.id === 'herb_satchel_3'
    ) {
      if (node.itemId && this.addUnique(adv.collectedItems, node.itemId)) {
        stateChanged = true;
        this.setAdventureMapObjectTile(session, player.uid, node.x, node.y, ObjectTile.NONE);
        const foundCount = ['herb_satchel_1', 'herb_satchel_2', 'herb_satchel_3'].filter((id) =>
          adv.collectedItems.includes(id)
        ).length;
        this.pushAdventureNotification(
          session,
          player.displayName,
          'item',
          `Found ${ADVENTURE_ITEMS[node.itemId]?.name ?? node.name}`,
          foundCount < 3
            ? `${foundCount}/3 seed satchels collected for Clara.`
            : 'All 3 satchels found! Return to Clara west of the plaza.'
        );
      }
    } else if (node.id === 'npc_clara') {
      const allSatchels = ['herb_satchel_1', 'herb_satchel_2', 'herb_satchel_3'].every((id) =>
        adv.collectedItems.includes(id)
      );
      if (allSatchels && !adv.completedQuests.includes('q2_clara_satchels')) {
        this.addUnique(adv.discoveredClues, 'clue_clara_ledger');
        this.addUnique(adv.collectedItems, 'copper_field_key');
        this.completeQuestIfNew(session, 'q2_clara_satchels', player.displayName);
        stateChanged = true;
      }
    }

    // 3. Quest 3 Clues (Signpost & Pasture Board)
    else if (node.id === 'west_signpost' || node.id === 'pasture_clue') {
      if (node.clueId && this.addUnique(adv.discoveredClues, node.clueId)) {
        stateChanged = true;
        const clue = ADVENTURE_CLUES[node.clueId];
        this.pushAdventureNotification(
          session,
          player.displayName,
          'clue',
          `Clue Discovered: ${clue?.title ?? node.name}`,
          'Added to the shared Field Journal.'
        );
      }
    }

    // 4. Quest 4: Boundary Stone & Hollow Oak Stump
    else if (node.id === 'south_boundary_stone') {
      if (this.addUnique(adv.discoveredClues, 'clue_boundary_stone')) {
        stateChanged = true;
        this.pushAdventureNotification(
          session,
          player.displayName,
          'clue',
          'Clue Discovered: Surveyor’s Boundary Stone',
          'Chiseled arrow points southeast to a hollow oak stump.'
        );
      }
    } else if (node.id === 'south_hollow_stump') {
      const c = this.addUnique(adv.discoveredClues, 'clue_hollow_stump');
      const m = this.addUnique(adv.collectedItems, 'map_fragment_2');
      if (c || m) {
        stateChanged = true;
        this.completeQuestIfNew(session, 'q4_meadow_footprints', player.displayName);
      }
    }

    // 5. Quest 5: Rowan & Lantern Tower
    else if (node.id === 'npc_rowan') {
      if (this.addUnique(adv.discoveredClues, 'clue_rowan_story')) {
        stateChanged = true;
        this.pushAdventureNotification(
          session,
          player.displayName,
          'story',
          "Rowan's Story Revealed",
          'Alden hid the village charter during the Great Flood to save Pixelfield.'
        );
      }
    } else if (node.id === 'pond_lantern_tower') {
      const c = this.addUnique(adv.discoveredClues, 'clue_lantern_inscription');
      const m = this.addUnique(adv.collectedItems, 'map_fragment_3');
      if (c || m) {
        stateChanged = true;
        this.completeQuestIfNew(session, 'q5_lantern_riddle', player.displayName);
      }
    }

    // 6. Quest 8: Alden's Final Letter & Founder's Treasure Chest
    else if (node.id === 'alden_final_letter') {
      if (this.addUnique(adv.discoveredClues, 'clue_alden_final_letter')) {
        stateChanged = true;
        this.pushAdventureNotification(
          session,
          player.displayName,
          'story',
          "Found Alden's Final Letter",
          'The truth behind Pixelfield’s charter is recorded in your Journal.'
        );
      }
    } else if (node.id === 'founders_vault_chest') {
      const hasCopperKey = adv.collectedItems.includes('copper_field_key');
      const hasSilverCrest = adv.collectedItems.includes('silver_vault_crest');
      if (hasCopperKey && hasSilverCrest && !adv.openedChests.includes('founders_vault_chest')) {
        this.addUnique(adv.unlockedChests, 'founders_vault_chest');
        this.addUnique(adv.openedChests, 'founders_vault_chest');
        this.addUnique(adv.collectedItems, 'founders_charter');
        this.setAdventureMapObjectTile(session, player.uid, node.x, node.y, ObjectTile.CHEST_OPENED);
        this.completeQuestIfNew(session, 'q8_founders_vault', player.displayName);
        this.pushAdventureNotification(
          session,
          player.displayName,
          'story',
          "Chapter Complete: The Founder's Cache Uncovered!",
          'Pixelfield’s Free Charter and Alden’s Golden Astrolabe belong to the village once more.'
        );
        stateChanged = true;
      }
    }

    // 7. Bonus Village Curios
    else if (node.kind === 'curio' && node.itemId) {
      if (this.addUnique(adv.collectedItems, node.itemId)) {
        stateChanged = true;
        this.setAdventureMapObjectTile(session, player.uid, node.x, node.y, ObjectTile.NONE);
        this.pushAdventureNotification(
          session,
          player.displayName,
          'item',
          `Bonus Curio Found: ${ADVENTURE_ITEMS[node.itemId]?.name ?? node.name}`,
          'Added to the group’s Satchel & Curios log.'
        );
      }
    }

    if (stateChanged) {
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'adventure.stateUpdated',
        adventure: session.adventure,
      });
      await saveAdventureProgress(session.room.id, session.adventure);
    }
  }

  private async handleAdventureSolvePuzzle(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    nodeId: string,
    answer: string | string[]
  ) {
    if (session.room.status !== 'active') return;
    const node = session.adventureNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const dist = Math.hypot(player.x - node.x, player.y - node.y);
    if (dist > 4.5) {
      this.send(player.socket, {
        v: PROTOCOL_VERSION,
        type: 'adventure.puzzleResult',
        nodeId,
        solved: false,
        message: 'Step closer to the lock to try an answer.',
      });
      return;
    }

    const adv = session.adventure;

    if (node.id === 'west_satchel_chest') {
      if (adv.openedChests.includes('west_satchel_chest')) {
        this.send(player.socket, {
          v: PROTOCOL_VERSION,
          type: 'adventure.puzzleResult',
          nodeId,
          solved: true,
          message: 'This chest is already open.',
        });
        return;
      }
      const code = typeof answer === 'string' ? answer.replace(/\D/g, '') : '';
      if (code !== DIAL_CHEST_CODE) {
        this.send(player.socket, {
          v: PROTOCOL_VERSION,
          type: 'adventure.puzzleResult',
          nodeId,
          solved: false,
          message:
            'The brass tumblers resist. Check Grandfather’s Ledger: corner lamps in the plaza, white sheep in the pasture, and hay bales in the pasture.',
        });
        return;
      }

      this.addUnique(adv.solvedPuzzles, node.id);
      this.addUnique(adv.unlockedChests, node.id);
      this.addUnique(adv.openedChests, node.id);
      this.addUnique(adv.discoveredClues, 'clue_satchel_journal');
      this.addUnique(adv.collectedItems, 'map_fragment_1');
      this.setAdventureMapObjectTile(session, player.uid, node.x, node.y, ObjectTile.CHEST_OPENED);
      this.completeQuestIfNew(session, 'q3_dial_chest', player.displayName);

      this.send(player.socket, {
        v: PROTOCOL_VERSION,
        type: 'adventure.puzzleResult',
        nodeId,
        solved: true,
        message: 'Click! The ironbound chest pops open, revealing Map Fragment I and Alden’s field note.',
      });
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'adventure.stateUpdated',
        adventure: adv,
      });
      await saveAdventureProgress(session.room.id, adv);
      return;
    }

    if (node.id === 'ruins_symbol_altar') {
      if (adv.solvedPuzzles.includes('ruins_symbol_altar')) {
        this.send(player.socket, {
          v: PROTOCOL_VERSION,
          type: 'adventure.puzzleResult',
          nodeId,
          solved: true,
          message: 'The Four-Emblem Altar is already aligned.',
        });
        return;
      }

      const seq = Array.isArray(answer) ? answer.map(String) : [];
      const matches =
        seq.length === EMBLEM_SEQUENCE_SOLUTION.length &&
        EMBLEM_SEQUENCE_SOLUTION.every((expected, idx) => seq[idx] === expected);

      if (!matches) {
        this.send(player.socket, {
          v: PROTOCOL_VERSION,
          type: 'adventure.puzzleResult',
          nodeId,
          solved: false,
          message:
            'The stone tiles slide back. Review the Lantern Tower inscription in your Journal for the order of a day’s work.',
        });
        return;
      }

      this.addUnique(adv.solvedPuzzles, node.id);
      this.addUnique(adv.collectedItems, 'silver_vault_crest');
      this.addUnique(adv.discoveredClues, 'clue_ruins_plates');
      this.completeQuestIfNew(session, 'q6_symbol_altar', player.displayName);

      this.send(player.socket, {
        v: PROTOCOL_VERSION,
        type: 'adventure.puzzleResult',
        nodeId,
        solved: true,
        message:
          'A deep rumble echoes! A drawer glides out holding the Silver Vault Crest, and the twin pressure stones to the east begin to glow.',
      });
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'adventure.stateUpdated',
        adventure: adv,
      });
      await saveAdventureProgress(session.room.id, adv);
    }
  }

  private evaluatePressurePlates(session: ActiveRoomSession) {
    if (session.room.status !== 'active' || session.adventure.hiddenDoorOpen) return;

    const plateA = session.adventureNodes.find((n) => n.id === 'coop_plate_a');
    const plateB = session.adventureNodes.find((n) => n.id === 'coop_plate_b');
    const doorNode = session.adventureNodes.find((n) => n.id === 'hidden_cavern_door');
    if (!plateA || !plateB || !doorNode) return;

    const now = Date.now();
    let standingA: ConnectedPlayer | null = null;
    let standingB: ConnectedPlayer | null = null;

    for (const p of session.players.values()) {
      if (!p.connected) continue;
      if (Math.hypot(p.x - plateA.x, p.y - plateA.y) <= 0.95) {
        standingA = p;
      }
      if (Math.hypot(p.x - plateB.x, p.y - plateB.y) <= 0.95) {
        standingB = p;
      }
    }

    // 12-second chime latch keeps cooperative play smooth AND guarantees solo explorers are never soft-locked
    if (standingA) session.plateLatchUntil.plateA = now + 12_000;
    if (standingB) session.plateLatchUntil.plateB = now + 12_000;

    const activeA = Boolean(standingA) || session.plateLatchUntil.plateA > now;
    const activeB = Boolean(standingB) || session.plateLatchUntil.plateB > now;

    const prevA = session.adventure.activePlates.plateA;
    const prevB = session.adventure.activePlates.plateB;

    if (activeA && activeB) {
      session.adventure.activePlates = { plateA: true, plateB: true };
      session.adventure.hiddenDoorOpen = true;
      const actor = standingA ?? standingB ?? Array.from(session.players.values())[0];
      const actorName = actor?.displayName ?? 'The Expedition';
      const actorUid = actor?.uid ?? session.room.ownerUid;

      this.setAdventureMapObjectTile(
        session,
        actorUid,
        doorNode.x,
        doorNode.y,
        ObjectTile.HIDDEN_DOOR_OPEN
      );
      this.completeQuestIfNew(session, 'q7_twin_plates', actorName);
      this.pushAdventureNotification(
        session,
        actorName,
        'mechanism',
        'Hidden Cavern Path Opened!',
        "Both pressure stones clicked into place—Founder's Cavern is now open to explore."
      );
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'adventure.stateUpdated',
        adventure: session.adventure,
      });
      void saveAdventureProgress(session.room.id, session.adventure);
      return;
    }

    if (activeA !== prevA || activeB !== prevB) {
      session.adventure.activePlates = { plateA: activeA, plateB: activeB };
      this.broadcast(session, {
        v: PROTOCOL_VERSION,
        type: 'adventure.stateUpdated',
        adventure: session.adventure,
      });
      if ((activeA && !prevA) || (activeB && !prevB)) {
        const actorName = (standingA ?? standingB)?.displayName ?? 'A teammate';
        this.pushAdventureNotification(
          session,
          actorName,
          'mechanism',
          '1 / 2 Pressure Stones Lit',
          'Step on the second pressure stone nearby to unseal the cavern doorway!'
        );
      }
    }
  }

  private handleChat(session: ActiveRoomSession, player: ConnectedPlayer, rawText: string) {
    const text = sanitizePlainText(rawText, 240);
    if (!text) return;

    const now = Date.now();
    player.chatTimestamps = player.chatTimestamps.filter((t) => now - t < 6000);
    if (player.chatTimestamps.length >= 5) {
      this.sendError(player.socket, 'RATE_LIMITED', 'Please wait a moment before sending another message.');
      return;
    }
    player.chatTimestamps.push(now);

    const payload: ChatMessagePayload = {
      id: generateSecureId(8),
      senderUid: player.uid,
      senderName: player.displayName,
      senderColor: player.avatarColor,
      text,
      timestamp: now,
      kind: 'chat',
    };

    session.recentChat.push(payload);
    if (session.recentChat.length > 40) {
      session.recentChat.shift();
    }

    this.broadcast(session, {
      v: PROTOCOL_VERSION,
      type: 'chat.message',
      message: payload,
    });
  }

  private async handleReport(
    session: ActiveRoomSession,
    player: ConnectedPlayer,
    targetUid: string,
    reason: string
  ) {
    if (!targetUid || targetUid === player.uid) return;
    await recordChatReport(session.room.id, player.uid, targetUid, reason);
    this.send(player.socket, {
      v: PROTOCOL_VERSION,
      type: 'chat.notice',
      text: 'Report recorded. You can also mute this player locally from the roster.',
      timestamp: Date.now(),
    });
  }

  private broadcastMovementTick(session: ActiveRoomSession) {
    const states: Array<{
      uid: string;
      x: number;
      y: number;
      facing: FacingDir;
      walking: boolean;
      seq: number;
    }> = [];

    for (const p of session.players.values()) {
      if (p.connected && p.dirtyMove) {
        states.push({
          uid: p.uid,
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
          facing: p.facing,
          walking: p.walking,
          seq: p.seq,
        });
        p.dirtyMove = false;
      }
    }

    if (states.length === 0) return;
    this.broadcast(session, {
      v: PROTOCOL_VERSION,
      type: 'player.stateBatch',
      states,
    });
  }

  private scheduleAutosave(session: ActiveRoomSession) {
    if (session.flushTimer) return;
    session.flushTimer = setTimeout(() => {
      session.flushTimer = null;
      void this.flushSession(session);
    }, AUTOSAVE_INTERVAL_MS);
  }

  private async flushSession(session: ActiveRoomSession) {
    if (session.dirtyChunks.size === 0 && session.pendingEdits.length === 0) return;
    const chunksToFlush = new Set(session.dirtyChunks);
    const editsToFlush = [...session.pendingEdits];
    session.dirtyChunks.clear();
    session.pendingEdits = [];

    try {
      await flushDirtyWorldChunks(
        session.room.id,
        session.worldId,
        session.map,
        chunksToFlush,
        editsToFlush,
        session.saveVersion,
        session.chunkSize
      );
    } catch {
      // Re-queue dirty chunks if transient flush error occurred
      for (const k of chunksToFlush) session.dirtyChunks.add(k);
    }
  }

  private runHeartbeatSweep() {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      for (const p of session.players.values()) {
        if (!p.connected || !p.socket) continue;
        if (now - p.lastPongAt > 40_000) {
          p.socket.terminate();
        }
      }
    }
  }

  private pushSystemNotice(session: ActiveRoomSession, text: string) {
    const payload: ChatMessagePayload = {
      id: generateSecureId(8),
      senderUid: 'system',
      senderName: 'Village',
      senderColor: '#64748B',
      text,
      timestamp: Date.now(),
      kind: 'system',
    };
    session.recentChat.push(payload);
    if (session.recentChat.length > 40) {
      session.recentChat.shift();
    }
    this.broadcast(session, {
      v: PROTOCOL_VERSION,
      type: 'chat.message',
      message: payload,
    });
  }

  private toPublicPlayer(p: ConnectedPlayer): RoomPlayerState {
    return {
      uid: p.uid,
      displayName: p.displayName,
      avatarColor: p.avatarColor,
      hatStyle: p.hatStyle,
      role: p.role,
      ready: p.ready,
      connected: p.connected,
      x: p.x,
      y: p.y,
      facing: p.facing,
      walking: p.walking,
      seq: p.seq,
    };
  }

  private send(ws: WebSocket | null, event: ServerEvent) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(event));
  }

  private sendError(ws: WebSocket | null, code: string, message: string) {
    this.send(ws, { v: PROTOCOL_VERSION, type: 'error', code, message });
  }

  private broadcast(session: ActiveRoomSession, event: ServerEvent, excludeUid?: string) {
    const payload = JSON.stringify(event);
    for (const p of session.players.values()) {
      if (excludeUid && p.uid === excludeUid) continue;
      if (p.socket && p.socket.readyState === WebSocket.OPEN) {
        p.socket.send(payload);
      }
    }
  }
}

export const roomManager = new RealtimeRoomManager();
