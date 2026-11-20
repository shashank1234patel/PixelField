import type { HatStyle, TileLayer } from './tiles.ts';

export const PROTOCOL_VERSION = 1;

export type RoomVisibility = 'code' | 'link' | 'open';
export type RoomStatus = 'lobby' | 'active' | 'closed';
export type BuildPolicy = 'everyone' | 'host_only' | 'build_zones';
export type MemberRole = 'host' | 'moderator' | 'player';
export type FacingDir = 'down' | 'up' | 'left' | 'right';

export interface UserProfile {
  uid: string;
  authType: 'google' | 'guest';
  email: string | null;
  displayName: string;
  avatarColor: string;
  hatStyle: HatStyle;
  reducedMotion: boolean;
}

export interface RoomSummary {
  id: string;
  shortCode: string;
  name: string;
  ownerUid: string;
  ownerName?: string;
  visibility: RoomVisibility;
  capacity: number;
  allowLateJoin: boolean;
  buildPolicy: BuildPolicy;
  hasPassword: boolean;
  status: RoomStatus;
  template: string;
  onlineCount: number;
  lastActiveAt: string;
}

export interface RoomPlayerState {
  uid: string;
  displayName: string;
  avatarColor: string;
  hatStyle: HatStyle;
  role: MemberRole;
  ready: boolean;
  connected: boolean;
  x: number; // world tile units (float)
  y: number; // world tile units (float)
  facing: FacingDir;
  walking: boolean;
  seq: number;
}

export interface ChatMessagePayload {
  id: string;
  senderUid: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: number;
  kind: 'chat' | 'system';
}

export interface ChunkSnapshotPayload {
  chunkX: number;
  chunkY: number;
  ground: number[];
  objects: number[];
  revision: number;
}

// Client -> Server WebSocket Messages
export type ClientEvent =
  | { v: number; type: 'auth.hello'; roomId: string; reconnectToken?: string }
  | { v: number; type: 'room.ready'; ready: boolean }
  | { v: number; type: 'room.start' }
  | { v: number; type: 'room.close' }
  | {
      v: number;
      type: 'room.updateSettings';
      name?: string;
      visibility?: RoomVisibility;
      capacity?: number;
      allowLateJoin?: boolean;
      buildPolicy?: BuildPolicy;
    }
  | { v: number; type: 'room.kick'; targetUid: string; ban?: boolean }
  | { v: number; type: 'room.transferHost'; targetUid: string }
  | {
      v: number;
      type: 'player.move';
      seq: number;
      x: number;
      y: number;
      facing: FacingDir;
      walking: boolean;
    }
  | {
      v: number;
      type: 'world.editRequest';
      requestId: string;
      tileX: number;
      tileY: number;
      layer: TileLayer;
      tileId: number;
    }
  | { v: number; type: 'world.undoRequest' }
  | { v: number; type: 'chat.send'; text: string }
  | { v: number; type: 'chat.report'; targetUid: string; reason: string }
  | { v: number; type: 'ping'; ts: number };

// Server -> Client WebSocket Messages
export type ServerEvent =
  | {
      v: number;
      type: 'room.snapshot';
      room: RoomSummary;
      selfUid: string;
      reconnectToken: string;
      players: RoomPlayerState[];
      world: {
        width: number;
        height: number;
        chunkSize: number;
        saveVersion: number;
        chunks: ChunkSnapshotPayload[];
      };
      recentChat: ChatMessagePayload[];
      canUndo: boolean;
    }
  | { v: number; type: 'player.joined'; player: RoomPlayerState }
  | { v: number; type: 'player.left'; uid: string; permanent: boolean }
  | {
      v: number;
      type: 'player.presence';
      uid: string;
      connected: boolean;
      ready: boolean;
      role: MemberRole;
    }
  | {
      v: number;
      type: 'player.stateBatch';
      states: Array<{
        uid: string;
        x: number;
        y: number;
        facing: FacingDir;
        walking: boolean;
        seq: number;
      }>;
    }
  | {
      v: number;
      type: 'world.editAccepted';
      requestId?: string;
      actorUid: string;
      tileX: number;
      tileY: number;
      layer: TileLayer;
      tileId: number;
      saveVersion: number;
      canUndo?: boolean;
    }
  | {
      v: number;
      type: 'world.editRejected';
      requestId?: string;
      tileX: number;
      tileY: number;
      layer: TileLayer;
      currentTileId: number;
      reason: string;
    }
  | { v: number; type: 'chat.message'; message: ChatMessagePayload }
  | { v: number; type: 'chat.notice'; text: string; timestamp: number }
  | { v: number; type: 'room.settingsChanged'; room: RoomSummary }
  | { v: number; type: 'room.kicked'; reason: string }
  | { v: number; type: 'room.closed'; reason: string }
  | { v: number; type: 'error'; code: string; message: string }
  | { v: number; type: 'pong'; ts: number };
