import { useCallback, useEffect, useRef, useState } from 'react';
import { soundFx } from '../game/sound.ts';
import {
  clearReconnectCredential,
  getActiveFirebaseIdToken,
  getReconnectCredential,
  saveReconnectCredential,
} from '../lib/api.ts';
import {
  type AdventureNotification,
  type AdventureState,
  createInitialAdventureState,
  normalizeAdventureState,
} from '../shared/adventureData.ts';
import {
  type BuildPolicy,
  type ChatMessagePayload,
  type ClientEvent,
  type FacingDir,
  PROTOCOL_VERSION,
  type RoomPlayerState,
  type RoomSummary,
  type RoomVisibility,
  type ServerEvent,
} from '../shared/protocol.ts';
import { type WorldMapData, unpackChunksToMap } from '../shared/starterMap.ts';
import { type TileLayer, tileIndex } from '../shared/tiles.ts';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface LivePlayerEntity extends RoomPlayerState {
  renderX: number;
  renderY: number;
  targetX: number;
  targetY: number;
}

export interface PuzzleFeedbackState {
  nodeId: string;
  solved: boolean;
  message: string;
  ts: number;
}

interface PendingOptimisticEdit {
  tileX: number;
  tileY: number;
  layer: TileLayer;
  previousTileId: number;
}

export function useRoomSocket(
  roomId: string | null,
  onFatalLeave: (reason: string) => void
) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [selfUid, setSelfUid] = useState<string | null>(null);
  const [players, setPlayers] = useState<RoomPlayerState[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [adventure, setAdventure] = useState<AdventureState>(() => createInitialAdventureState());
  const [adventureBanner, setAdventureBanner] = useState<AdventureNotification | null>(null);
  const [puzzleFeedback, setPuzzleFeedback] = useState<PuzzleFeedbackState | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [worldVersion, setWorldVersion] = useState(0);
  const [toast, setToast] = useState<{ id: number; text: string; tone: 'info' | 'error' } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mapRef = useRef<WorldMapData | null>(null);
  const playersRef = useRef<Map<string, LivePlayerEntity>>(new Map());
  const selfUidRef = useRef<string | null>(null);
  const pendingEditsRef = useRef<Map<string, PendingOptimisticEdit>>(new Map());
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const onFatalLeaveRef = useRef(onFatalLeave);
  onFatalLeaveRef.current = onFatalLeave;

  const pushToast = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setToast({ id: Date.now(), text, tone });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3400);
  }, []);

  const dismissAdventureBanner = useCallback(() => {
    setAdventureBanner(null);
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  }, []);

  const clearPuzzleFeedback = useCallback(() => {
    setPuzzleFeedback(null);
  }, []);

  const syncPlayersList = useCallback(() => {
    const arr = Array.from(playersRef.current.values()).map(
      ({ renderX: _rx, renderY: _ry, targetX: _tx, targetY: _ty, ...pub }) => pub
    );
    arr.sort((a, b) => {
      if (a.role === 'host' && b.role !== 'host') return -1;
      if (b.role === 'host' && a.role !== 'host') return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    setPlayers(arr);
  }, []);

  const sendEvent = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(event));
    return true;
  }, []);

  useEffect(() => {
    if (!roomId) return;
    intentionalCloseRef.current = false;
    retryCountRef.current = 0;

    const connect = async () => {
      if (intentionalCloseRef.current) return;
      setConnectionState(retryCountRef.current === 0 ? 'connecting' : 'reconnecting');

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const idToken = await getActiveFirebaseIdToken();
      const qs = idToken ? `?idToken=${encodeURIComponent(idToken)}` : '';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws${qs}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const storedReconnect = getReconnectCredential(roomId) ?? undefined;
        const hello: ClientEvent = {
          v: PROTOCOL_VERSION,
          type: 'auth.hello',
          roomId,
          reconnectToken: storedReconnect,
        };
        ws.send(JSON.stringify(hello));

        if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping', ts: Date.now() }));
          }
        }, 12_000);
      };

      ws.onmessage = (ev) => {
        let msg: ServerEvent;
        try {
          msg = JSON.parse(ev.data) as ServerEvent;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'room.snapshot': {
            retryCountRef.current = 0;
            setConnectionState('connected');
            setRoom(msg.room);
            setSelfUid(msg.selfUid);
            selfUidRef.current = msg.selfUid;
            setCanUndo(msg.canUndo);
            setAdventure(normalizeAdventureState(msg.adventure));
            saveReconnectCredential(msg.room.id, msg.reconnectToken);

            // Reconstruct authoritative map from chunks
            mapRef.current = unpackChunksToMap(
              msg.world.chunks,
              msg.world.width,
              msg.world.height,
              msg.world.chunkSize
            );
            setWorldVersion(msg.world.saveVersion);

            // Hydrate live players map idempotently
            const nextMap = new Map<string, LivePlayerEntity>();
            for (const p of msg.players) {
              const prev = playersRef.current.get(p.uid);
              nextMap.set(p.uid, {
                ...p,
                renderX: prev ? prev.renderX : p.x,
                renderY: prev ? prev.renderY : p.y,
                targetX: p.x,
                targetY: p.y,
              });
            }
            playersRef.current = nextMap;
            syncPlayersList();
            setChatMessages(msg.recentChat);
            break;
          }

          case 'adventure.stateUpdated': {
            setAdventure(normalizeAdventureState(msg.adventure));
            break;
          }

          case 'adventure.notification': {
            setAdventureBanner(msg.notification);
            if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
            bannerTimerRef.current = window.setTimeout(() => setAdventureBanner(null), 5500);

            if (msg.notification.kind === 'quest' || msg.notification.kind === 'story') {
              soundFx.questComplete();
            } else if (msg.notification.kind === 'puzzle') {
              soundFx.chestOpen();
            } else if (msg.notification.kind === 'mechanism') {
              soundFx.plateClick();
            } else {
              soundFx.clueFound();
            }
            break;
          }

          case 'adventure.puzzleResult': {
            setPuzzleFeedback({
              nodeId: msg.nodeId,
              solved: msg.solved,
              message: msg.message,
              ts: Date.now(),
            });
            if (msg.solved) {
              soundFx.chestOpen();
            } else {
              soundFx.error();
            }
            break;
          }

          case 'player.joined': {
            const p = msg.player;
            const prev = playersRef.current.get(p.uid);
            playersRef.current.set(p.uid, {
              ...p,
              renderX: prev ? prev.renderX : p.x,
              renderY: prev ? prev.renderY : p.y,
              targetX: p.x,
              targetY: p.y,
            });
            syncPlayersList();
            break;
          }

          case 'player.left': {
            playersRef.current.delete(msg.uid);
            syncPlayersList();
            break;
          }

          case 'player.presence': {
            const existing = playersRef.current.get(msg.uid);
            if (existing) {
              existing.connected = msg.connected;
              existing.ready = msg.ready;
              existing.role = msg.role;
              syncPlayersList();
            }
            break;
          }

          case 'player.stateBatch': {
            for (const s of msg.states) {
              const entity = playersRef.current.get(s.uid);
              if (!entity) continue;
              entity.targetX = s.x;
              entity.targetY = s.y;
              entity.x = s.x;
              entity.y = s.y;
              entity.seq = s.seq;
              if (s.uid !== selfUidRef.current) {
                entity.facing = s.facing;
                entity.walking = s.walking;
              }
            }
            break;
          }

          case 'world.editAccepted': {
            if (msg.requestId) {
              pendingEditsRef.current.delete(msg.requestId);
            }
            if (mapRef.current) {
              const idx = tileIndex(msg.tileX, msg.tileY, mapRef.current.width);
              if (msg.layer === 'ground') {
                mapRef.current.ground[idx] = msg.tileId;
              } else {
                mapRef.current.objects[idx] = msg.tileId;
              }
            }
            setWorldVersion(msg.saveVersion);
            if (typeof msg.canUndo === 'boolean') {
              setCanUndo(msg.canUndo);
            }
            break;
          }

          case 'world.editRejected': {
            if (msg.requestId) {
              pendingEditsRef.current.delete(msg.requestId);
            }
            if (mapRef.current) {
              const idx = tileIndex(msg.tileX, msg.tileY, mapRef.current.width);
              if (msg.layer === 'ground') {
                mapRef.current.ground[idx] = msg.currentTileId;
              } else {
                mapRef.current.objects[idx] = msg.currentTileId;
              }
            }
            soundFx.error();
            pushToast(msg.reason, 'error');
            break;
          }

          case 'chat.message': {
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === msg.message.id)) return prev;
              const next = [...prev, msg.message];
              return next.length > 60 ? next.slice(next.length - 60) : next;
            });
            if (msg.message.kind === 'chat' && msg.message.senderUid !== selfUidRef.current) {
              soundFx.chat();
            }
            break;
          }

          case 'chat.notice': {
            pushToast(msg.text, 'info');
            break;
          }

          case 'room.settingsChanged': {
            setRoom((prev) => {
              if (prev?.status === 'lobby' && msg.room.status === 'active') {
                soundFx.startWorld();
              }
              return msg.room;
            });
            break;
          }

          case 'room.kicked': {
            intentionalCloseRef.current = true;
            clearReconnectCredential(roomId);
            onFatalLeaveRef.current(msg.reason);
            break;
          }

          case 'room.closed': {
            intentionalCloseRef.current = true;
            clearReconnectCredential(roomId);
            onFatalLeaveRef.current(msg.reason);
            break;
          }

          case 'error': {
            if (msg.code === 'JOIN_FAILED' || msg.code === 'UNAUTHORIZED') {
              intentionalCloseRef.current = true;
              clearReconnectCredential(roomId);
              onFatalLeaveRef.current(msg.message);
            } else {
              pushToast(msg.message, 'error');
            }
            break;
          }
        }
      };

      ws.onclose = (ev) => {
        if (pingTimerRef.current) {
          window.clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (intentionalCloseRef.current || ev.code === 4000 || ev.code === 4003 || ev.code === 4004) {
          setConnectionState('disconnected');
          return;
        }
        setConnectionState('reconnecting');
        const delay = Math.min(8000, 1000 * Math.pow(1.7, retryCountRef.current));
        retryCountRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          void connect();
        }, delay);
      };
    };

    void connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      wsRef.current?.close(1000, 'Leaving room');
      wsRef.current = null;
    };
  }, [roomId, pushToast, syncPlayersList]);

  const sendMove = useCallback(
    (seq: number, x: number, y: number, facing: FacingDir, walking: boolean) => {
      sendEvent({
        v: PROTOCOL_VERSION,
        type: 'player.move',
        seq,
        x,
        y,
        facing,
        walking,
      });
    },
    [sendEvent]
  );

  const interactAdventureNode = useCallback(
    (nodeId: string) => {
      sendEvent({
        v: PROTOCOL_VERSION,
        type: 'adventure.interact',
        nodeId,
      });
    },
    [sendEvent]
  );

  const solveAdventurePuzzle = useCallback(
    (nodeId: string, answer: string | string[]) => {
      sendEvent({
        v: PROTOCOL_VERSION,
        type: 'adventure.solvePuzzle',
        nodeId,
        answer,
      });
    },
    [sendEvent]
  );

  const requestEdit = useCallback(
    (tileX: number, tileY: number, layer: TileLayer, tileId: number) => {
      if (!mapRef.current) return;
      const idx = tileIndex(tileX, tileY, mapRef.current.width);
      const prevTile = layer === 'ground' ? mapRef.current.ground[idx] : mapRef.current.objects[idx];
      if (prevTile === tileId) return;

      const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      pendingEditsRef.current.set(requestId, { tileX, tileY, layer, previousTileId: prevTile });

      if (layer === 'ground') {
        mapRef.current.ground[idx] = tileId;
      } else {
        mapRef.current.objects[idx] = tileId;
      }

      if (tileId === 0 && layer === 'object') {
        soundFx.remove();
      } else {
        soundFx.place();
      }

      sendEvent({
        v: PROTOCOL_VERSION,
        type: 'world.editRequest',
        requestId,
        tileX,
        tileY,
        layer,
        tileId,
      });
    },
    [sendEvent]
  );

  const requestUndo = useCallback(() => {
    sendEvent({ v: PROTOCOL_VERSION, type: 'world.undoRequest' });
  }, [sendEvent]);

  const sendChat = useCallback(
    (text: string) => {
      sendEvent({ v: PROTOCOL_VERSION, type: 'chat.send', text });
    },
    [sendEvent]
  );

  const reportPlayer = useCallback(
    (targetUid: string, reason: string) => {
      sendEvent({ v: PROTOCOL_VERSION, type: 'chat.report', targetUid, reason });
    },
    [sendEvent]
  );

  const setReady = useCallback(
    (ready: boolean) => {
      sendEvent({ v: PROTOCOL_VERSION, type: 'room.ready', ready });
    },
    [sendEvent]
  );

  const startRoom = useCallback(() => {
    sendEvent({ v: PROTOCOL_VERSION, type: 'room.start' });
  }, [sendEvent]);

  const closeRoom = useCallback(() => {
    sendEvent({ v: PROTOCOL_VERSION, type: 'room.close' });
  }, [sendEvent]);

  const updateSettings = useCallback(
    (settings: {
      name?: string;
      visibility?: RoomVisibility;
      capacity?: number;
      allowLateJoin?: boolean;
      buildPolicy?: BuildPolicy;
    }) => {
      sendEvent({ v: PROTOCOL_VERSION, type: 'room.updateSettings', ...settings });
    },
    [sendEvent]
  );

  const kickPlayer = useCallback(
    (targetUid: string, ban = false) => {
      sendEvent({ v: PROTOCOL_VERSION, type: 'room.kick', targetUid, ban });
    },
    [sendEvent]
  );

  const transferHost = useCallback(
    (targetUid: string) => {
      sendEvent({ v: PROTOCOL_VERSION, type: 'room.transferHost', targetUid });
    },
    [sendEvent]
  );

  const leaveRoom = useCallback(() => {
    intentionalCloseRef.current = true;
    if (roomId) clearReconnectCredential(roomId);
    wsRef.current?.close(1000, 'Left village');
  }, [roomId]);

  return {
    connectionState,
    room,
    selfUid,
    players,
    chatMessages,
    adventure,
    adventureBanner,
    puzzleFeedback,
    canUndo,
    worldVersion,
    toast,
    mapRef,
    playersRef,
    sendMove,
    interactAdventureNode,
    solveAdventurePuzzle,
    dismissAdventureBanner,
    clearPuzzleFeedback,
    requestEdit,
    requestUndo,
    sendChat,
    reportPlayer,
    setReady,
    startRoom,
    closeRoom,
    updateSettings,
    kickPlayer,
    transferHost,
    leaveRoom,
  };
}

