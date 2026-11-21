import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Hammer, Eraser } from 'lucide-react';
import { drawVillagerSprite, getSpriteAtlas } from '../game/pixelSprites.ts';
import type { LivePlayerEntity } from '../hooks/useRoomSocket.ts';
import type { BuildPolicy, FacingDir } from '../shared/protocol.ts';
import type { WorldMapData } from '../shared/starterMap.ts';
import {
  GroundTile,
  ObjectTile,
  type PaletteItem,
  SPAWN_TILE,
  TILE_SIZE,
  type TileLayer,
  isInBuildZone,
  isProtectedLandmarkTile,
  isTileSolid,
  tileIndex,
} from '../shared/tiles.ts';

interface VillageCanvasProps {
  mapRef: React.RefObject<WorldMapData | null>;
  playersRef: React.RefObject<Map<string, LivePlayerEntity>>;
  selfUid: string | null;
  buildMode: 'build' | 'break';
  selectedItem: PaletteItem;
  buildPolicy: BuildPolicy;
  zoom: number;
  reducedMotion: boolean;
  showMinimap: boolean;
  worldVersion: number;
  onSendMove: (seq: number, x: number, y: number, facing: FacingDir, walking: boolean) => void;
  onRequestEdit: (tileX: number, tileY: number, layer: TileLayer, tileId: number) => void;
  onCoordsChange?: (x: number, y: number) => void;
}

const MOVE_SPEED = 5.4; // tiles/sec
const MAX_REACH = 6.2;

function getMinimapColor(ground: number, obj: number): string {
  if (obj !== ObjectTile.NONE) {
    switch (obj) {
      case ObjectTile.ROOF_TERRACOTTA:
        return '#C86442';
      case ObjectTile.ROOF_SLATE:
        return '#4B5768';
      case ObjectTile.WOOD_WALL:
      case ObjectTile.WOOD_DOOR:
      case ObjectTile.WINDOW:
        return '#A57548';
      case ObjectTile.STONE_WALL:
        return '#8D959C';
      case ObjectTile.TREE_OAK:
        return '#2E6A34';
      case ObjectTile.TREE_PINE:
        return '#225432';
      case ObjectTile.BUSH:
        return '#3E7D44';
      case ObjectTile.FENCE:
        return '#8F6842';
      case ObjectTile.CROP_CARROT:
      case ObjectTile.CROP_SUNFLOWER:
        return '#75A847';
      case ObjectTile.FLOWER_BED:
        return '#D96B8A';
      case ObjectTile.WELL:
      case ObjectTile.LANTERN_TOWER:
        return '#D8DFE5';
      case ObjectTile.LAMP_POST:
        return '#F4C95D';
      case ObjectTile.SHEEP:
        return '#F5F4EF';
      case ObjectTile.CHICKEN:
      case ObjectTile.HAY_BALE:
        return '#E4B852';
      case ObjectTile.BENCH:
      case ObjectTile.CRATE:
      case ObjectTile.BARREL:
      case ObjectTile.SIGNPOST:
        return '#9C6D3E';
      default:
        return '#6C7570';
    }
  }
  switch (ground) {
    case GroundTile.WATER:
      return '#3B82B6';
    case GroundTile.BRIDGE:
    case GroundTile.WOOD_FLOOR:
      return '#B58450';
    case GroundTile.STONE_PATH:
      return '#A8AEB2';
    case GroundTile.ROAD_EDGE:
      return '#8B9297';
    case GroundTile.PLAZA_STONE:
      return '#C0C4C7';
    case GroundTile.DIRT_SOIL:
      return '#8B6242';
    case GroundTile.SAND_SHORE:
      return '#D6C493';
    case GroundTile.GRASS_FLOWERS:
      return '#70B04D';
    case GroundTile.GRASS_TUFT:
      return '#52933D';
    default:
      return '#5FA246';
  }
}

function collides(map: WorldMapData, x: number, y: number): boolean {
  const r = 0.28;
  const pts: Array<[number, number]> = [
    [x - r, y - r],
    [x + r, y - r],
    [x - r, y + r],
    [x + r, y + r],
  ];
  for (const [sx, sy] of pts) {
    const tx = Math.floor(sx + 0.5);
    const ty = Math.floor(sy + 0.5);
    if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return true;
    const idx = tileIndex(tx, ty, map.width);
    if (isTileSolid(map.ground[idx], map.objects[idx])) return true;
  }
  return false;
}

export const VillageCanvas: React.FC<VillageCanvasProps> = ({
  mapRef,
  playersRef,
  selfUid,
  buildMode,
  selectedItem,
  buildPolicy,
  zoom,
  reducedMotion,
  showMinimap,
  worldVersion,
  onSendMove,
  onRequestEdit,
  onCoordsChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapBaseRef = useRef<HTMLCanvasElement | null>(null);
  const minimapVersionRef = useRef<number>(-1);
  const minimapMapRef = useRef<WorldMapData | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const dpadRef = useRef({ up: false, down: false, left: false, right: false });
  const hoverTileRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef({ x: SPAWN_TILE.x * TILE_SIZE, y: SPAWN_TILE.y * TILE_SIZE });
  const cameraInitializedRef = useRef(false);
  const moveSeqRef = useRef(1);
  const lastSentMoveRef = useRef({ t: 0, x: -1, y: -1, facing: 'down' as FacingDir, walking: false });
  const lastReportedCoordRef = useRef({ x: -1, y: -1 });
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const propsRef = useRef({
    selfUid,
    buildMode,
    selectedItem,
    buildPolicy,
    zoom,
    reducedMotion,
    showMinimap,
    worldVersion,
    onSendMove,
    onRequestEdit,
    onCoordsChange,
  });
  propsRef.current = {
    selfUid,
    buildMode,
    selectedItem,
    buildPolicy,
    zoom,
    reducedMotion,
    showMinimap,
    worldVersion,
    onSendMove,
    onRequestEdit,
    onCoordsChange,
  };

  useEffect(() => {
    const touchCapable =
      'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768;
    setIsTouchDevice(touchCapable);
  }, []);

  const triggerEditAt = (tx: number, ty: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return;
    const { buildMode: mode, selectedItem: item, onRequestEdit: editFn } = propsRef.current;
    if (mode === 'break') {
      const idx = tileIndex(tx, ty, map.width);
      if (map.objects[idx] !== ObjectTile.NONE) {
        editFn(tx, ty, 'object', ObjectTile.NONE);
      } else if (map.ground[idx] !== GroundTile.GRASS) {
        editFn(tx, ty, 'ground', GroundTile.GRASS);
      }
    } else {
      editFn(tx, ty, item.layer, item.tileId);
    }
  };

  const triggerActionInFront = () => {
    const uid = propsRef.current.selfUid;
    if (!uid) return;
    const self = playersRef.current?.get(uid);
    if (!self) return;
    const offsets: Record<FacingDir, [number, number]> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    const [ox, oy] = offsets[self.facing];
    triggerEditAt(Math.round(self.renderX + ox), Math.round(self.renderY + oy));
  };

  // Keyboard listener (ignores input/textarea focus)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
      } else if (key === ' ') {
        e.preventDefault();
        if (hoverTileRef.current) {
          triggerEditAt(hoverTileRef.current.x, hoverTileRef.current.y);
        } else {
          triggerActionInFront();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const onBlur = () => {
      keysRef.current.clear();
      dpadRef.current = { up: false, down: false, left: false, right: false };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Main 60 FPS Canvas Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const atlas = getSpriteAtlas();
    let rafId = 0;
    let lastTime = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = parent.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const animTime = now / 1000;

      const {
        selfUid: uid,
        buildMode: mode,
        selectedItem: item,
        buildPolicy: policy,
        zoom: currentZoom,
        reducedMotion: lowEffects,
        showMinimap: minimapVisible,
        worldVersion: currentWorldVersion,
        onSendMove: sendMoveFn,
        onCoordsChange: reportCoords,
      } = propsRef.current;

      const map = mapRef.current;
      const playersMap = playersRef.current;
      const viewW = canvas.clientWidth;
      const viewH = canvas.clientHeight;
      const scaledTile = TILE_SIZE * currentZoom;

      // 1. Update local player movement & remote interpolation
      const self = uid && playersMap ? playersMap.get(uid) : null;
      if (self && map) {
        const keys = keysRef.current;
        const pad = dpadRef.current;
        let dx = 0;
        let dy = 0;
        if (keys.has('w') || keys.has('arrowup') || pad.up) dy -= 1;
        if (keys.has('s') || keys.has('arrowdown') || pad.down) dy += 1;
        if (keys.has('a') || keys.has('arrowleft') || pad.left) dx -= 1;
        if (keys.has('d') || keys.has('arrowright') || pad.right) dx += 1;

        const walking = dx !== 0 || dy !== 0;
        if (walking) {
          const len = Math.hypot(dx, dy);
          dx /= len;
          dy /= len;

          if (Math.abs(dx) > Math.abs(dy)) {
            self.facing = dx > 0 ? 'right' : 'left';
          } else {
            self.facing = dy > 0 ? 'down' : 'up';
          }

          const nextX = Math.max(0.5, Math.min(map.width - 1.5, self.renderX + dx * MOVE_SPEED * dt));
          const nextY = Math.max(0.5, Math.min(map.height - 1.5, self.renderY + dy * MOVE_SPEED * dt));

          if (!collides(map, nextX, self.renderY)) {
            self.renderX = nextX;
          }
          if (!collides(map, self.renderX, nextY)) {
            self.renderY = nextY;
          }
        }
        self.walking = walking;

        // Soft authoritative reconciliation if server corrected position significantly
        const serverErr = Math.hypot(self.targetX - self.renderX, self.targetY - self.renderY);
        if (serverErr > 1.8) {
          self.renderX += (self.targetX - self.renderX) * 0.25;
          self.renderY += (self.targetY - self.renderY) * 0.25;
        }

        // Send throttled movement intent (~16 Hz) when moving or state transitions
        const last = lastSentMoveRef.current;
        const moved =
          Math.abs(self.renderX - last.x) > 0.015 ||
          Math.abs(self.renderY - last.y) > 0.015 ||
          self.facing !== last.facing ||
          walking !== last.walking;

        if (moved && now - last.t >= 60) {
          moveSeqRef.current += 1;
          sendMoveFn(moveSeqRef.current, self.renderX, self.renderY, self.facing, walking);
          lastSentMoveRef.current = {
            t: now,
            x: self.renderX,
            y: self.renderY,
            facing: self.facing,
            walking,
          };
        }

        const rx = Math.round(self.renderX);
        const ry = Math.round(self.renderY);
        if (
          reportCoords &&
          (rx !== lastReportedCoordRef.current.x || ry !== lastReportedCoordRef.current.y)
        ) {
          lastReportedCoordRef.current = { x: rx, y: ry };
          reportCoords(rx, ry);
        }

        // Smooth camera follow clamped to world edges (instant lock on first frame)
        const targetCamX = (self.renderX + 0.5) * scaledTile - viewW / 2;
        const targetCamY = (self.renderY + 0.5) * scaledTile - viewH / 2;
        const maxCamX = Math.max(0, map.width * scaledTile - viewW);
        const maxCamY = Math.max(0, map.height * scaledTile - viewH);
        const clampedCamX = Math.max(0, Math.min(maxCamX, targetCamX));
        const clampedCamY = Math.max(0, Math.min(maxCamY, targetCamY));

        if (!cameraInitializedRef.current) {
          cameraRef.current.x = clampedCamX;
          cameraRef.current.y = clampedCamY;
          cameraInitializedRef.current = true;
        } else {
          const camLerp = lowEffects ? 1 : Math.min(1, dt * 9);
          cameraRef.current.x += (clampedCamX - cameraRef.current.x) * camLerp;
          cameraRef.current.y += (clampedCamY - cameraRef.current.y) * camLerp;
        }
      }

      // Interpolate remote players smoothly
      if (playersMap) {
        const lerpRate = Math.min(1, dt * 12);
        for (const entity of playersMap.values()) {
          if (entity.uid === uid) continue;
          entity.renderX += (entity.targetX - entity.renderX) * lerpRate;
          entity.renderY += (entity.targetY - entity.renderY) * lerpRate;
        }
      }

      // 2. Render visible world slice
      ctx.fillStyle = '#18241E';
      ctx.fillRect(0, 0, viewW, viewH);

      if (map) {
        const camX = Math.round(cameraRef.current.x);
        const camY = Math.round(cameraRef.current.y);

        const startCol = Math.max(0, Math.floor(camX / scaledTile) - 1);
        const endCol = Math.min(map.width - 1, Math.ceil((camX + viewW) / scaledTile) + 1);
        const startRow = Math.max(0, Math.floor(camY / scaledTile) - 1);
        const endRow = Math.min(map.height - 1, Math.ceil((camY + viewH) / scaledTile) + 1);

        const waterFrameIdx = lowEffects ? 0 : Math.floor(animTime * 2.5) % atlas.waterFrames.length;
        const lampPositions: Array<{ sx: number; sy: number; big: boolean }> = [];

        // Ground layer
        for (let ty = startRow; ty <= endRow; ty++) {
          for (let tx = startCol; tx <= endCol; tx++) {
            const idx = tileIndex(tx, ty, map.width);
            const gTile = map.ground[idx];
            const sx = tx * scaledTile - camX;
            const sy = ty * scaledTile - camY;

            let sprite: HTMLCanvasElement | undefined;
            if (gTile === GroundTile.WATER) {
              sprite = atlas.waterFrames[waterFrameIdx];
            } else {
              const variants = atlas.ground.get(gTile);
              if (variants && variants.length > 0) {
                const variantIdx = ((tx * 31 + ty * 17) >>> 0) % variants.length;
                sprite = variants[variantIdx];
              }
            }
            if (sprite) {
              ctx.drawImage(sprite, sx, sy, scaledTile, scaledTile);
            }

            // Subtle highlight for permitted build zones when policy is 'build_zones'
            if (policy === 'build_zones' && isInBuildZone(tx, ty, map.width, map.height)) {
              ctx.fillStyle = 'rgba(255, 243, 176, 0.08)';
              ctx.fillRect(sx, sy, scaledTile, scaledTile);
            }
          }
        }

        // Object layer
        for (let ty = startRow; ty <= endRow; ty++) {
          for (let tx = startCol; tx <= endCol; tx++) {
            const idx = tileIndex(tx, ty, map.width);
            const oTile = map.objects[idx];
            if (oTile === ObjectTile.NONE) continue;
            const sprite = atlas.objects.get(oTile);
            const sx = tx * scaledTile - camX;
            const sy = ty * scaledTile - camY;
            if (sprite) {
              ctx.drawImage(sprite, sx, sy, scaledTile, scaledTile);
            }
            if (oTile === ObjectTile.LAMP_POST || oTile === ObjectTile.LANTERN_TOWER) {
              lampPositions.push({
                sx: sx + scaledTile / 2,
                sy: sy + scaledTile * 0.32,
                big: oTile === ObjectTile.LANTERN_TOWER,
              });
            }
          }
        }

        // Hover placement preview
        const hover = hoverTileRef.current;
        if (hover && self && hover.x >= startCol && hover.x <= endCol && hover.y >= startRow && hover.y <= endRow) {
          const sx = hover.x * scaledTile - camX;
          const sy = hover.y * scaledTile - camY;
          const inRange = Math.hypot(hover.x - self.renderX, hover.y - self.renderY) <= MAX_REACH;
          const protectedTile = isProtectedLandmarkTile(hover.x, hover.y, map.width, map.height);
          const allowedZone =
            policy !== 'build_zones' ||
            self.role !== 'player' ||
            isInBuildZone(hover.x, hover.y, map.width, map.height);
          const valid = inRange && !protectedTile && allowedZone;

          if (mode === 'build' && valid) {
            ctx.save();
            ctx.globalAlpha = 0.62;
            if (item.layer === 'ground') {
              const spr = atlas.ground.get(item.tileId)?.[0];
              if (spr) ctx.drawImage(spr, sx, sy, scaledTile, scaledTile);
            } else {
              const spr = atlas.objects.get(item.tileId);
              if (spr) ctx.drawImage(spr, sx, sy, scaledTile, scaledTile);
            }
            ctx.restore();
          }

          ctx.strokeStyle = !valid
            ? 'rgba(239, 68, 68, 0.9)'
            : mode === 'break'
            ? 'rgba(245, 158, 11, 0.95)'
            : 'rgba(248, 250, 252, 0.95)';
          ctx.lineWidth = 2;
          ctx.strokeRect(sx + 1, sy + 1, scaledTile - 2, scaledTile - 2);
        }

        // Depth-sorted Villagers (sorted by renderY so overlapping villagers layer naturally)
        if (playersMap) {
          const sorted = Array.from(playersMap.values()).sort((a, b) => a.renderY - b.renderY);
          for (const p of sorted) {
            const screenX = (p.renderX + 0.5) * scaledTile - camX;
            const screenY = (p.renderY + 0.6) * scaledTile - camY;
            if (
              screenX < -scaledTile * 2 ||
              screenX > viewW + scaledTile * 2 ||
              screenY < -scaledTile * 2 ||
              screenY > viewH + scaledTile * 2
            ) {
              continue;
            }
            drawVillagerSprite(ctx, screenX, screenY, currentZoom, {
              avatarColor: p.avatarColor,
              hatStyle: p.hatStyle,
              facing: p.facing,
              walking: p.walking,
              animTime,
              displayName: p.displayName,
              isSelf: p.uid === uid,
              isHost: p.role === 'host',
              connected: p.connected,
            });
          }
        }

        // Warm subtle lantern glow halos (disabled in reduced-motion mode)
        if (!lowEffects && lampPositions.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          for (const lamp of lampPositions) {
            const radius = (lamp.big ? 3.2 : 2.0) * scaledTile;
            const flicker = 0.95 + Math.sin(animTime * 3 + lamp.sx * 0.05) * 0.05;
            const grad = ctx.createRadialGradient(
              lamp.sx,
              lamp.sy,
              2,
              lamp.sx,
              lamp.sy,
              radius * flicker
            );
            grad.addColorStop(0, 'rgba(255, 214, 112, 0.34)');
            grad.addColorStop(0.5, 'rgba(255, 180, 70, 0.12)');
            grad.addColorStop(1, 'rgba(255, 180, 70, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(lamp.sx, lamp.sy, radius * flicker, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        // 3. Render live minimap when visible
        if (minimapVisible && minimapCanvasRef.current) {
          const mini = minimapCanvasRef.current;
          if (mini.width !== map.width || mini.height !== map.height) {
            mini.width = map.width;
            mini.height = map.height;
          }
          if (
            !minimapBaseRef.current ||
            minimapMapRef.current !== map ||
            minimapVersionRef.current !== currentWorldVersion
          ) {
            const base = minimapBaseRef.current ?? document.createElement('canvas');
            base.width = map.width;
            base.height = map.height;
            const bctx = base.getContext('2d');
            if (bctx) {
              for (let y = 0; y < map.height; y++) {
                for (let x = 0; x < map.width; x++) {
                  const idx = tileIndex(x, y, map.width);
                  bctx.fillStyle = getMinimapColor(map.ground[idx], map.objects[idx]);
                  bctx.fillRect(x, y, 1, 1);
                }
              }
            }
            minimapBaseRef.current = base;
            minimapMapRef.current = map;
            minimapVersionRef.current = currentWorldVersion;
          }

          const mctx = mini.getContext('2d');
          if (mctx && minimapBaseRef.current) {
            mctx.imageSmoothingEnabled = false;
            mctx.drawImage(minimapBaseRef.current, 0, 0);

            // Viewport rectangle
            const vx = camX / scaledTile;
            const vy = camY / scaledTile;
            const vw = viewW / scaledTile;
            const vh = viewH / scaledTile;
            mctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
            mctx.lineWidth = Math.max(1, map.width / 160);
            mctx.strokeRect(vx, vy, vw, vh);

            // Villager markers
            if (playersMap) {
              const dotR = map.width >= 120 ? 2.4 : 1.5;
              for (const p of playersMap.values()) {
                if (!p.connected) continue;
                const isSelf = p.uid === uid;
                mctx.beginPath();
                mctx.arc(p.renderX + 0.5, p.renderY + 0.5, isSelf ? dotR + 0.8 : dotR, 0, Math.PI * 2);
                mctx.fillStyle = isSelf ? '#FFFFFF' : p.avatarColor;
                mctx.fill();
                mctx.lineWidth = 1;
                mctx.strokeStyle = isSelf ? '#16201C' : 'rgba(255,255,255,0.85)';
                mctx.stroke();
              }
            }
          }
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [mapRef, playersRef]);

  const screenToTile = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return null;
    const rect = canvas.getBoundingClientRect();
    const scaledTile = TILE_SIZE * propsRef.current.zoom;
    const tx = Math.floor((clientX - rect.left + cameraRef.current.x) / scaledTile);
    const ty = Math.floor((clientY - rect.top + cameraRef.current.y) / scaledTile);
    if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return null;
    return { x: tx, y: ty };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hoverTileRef.current = screenToTile(e.clientX, e.clientY);
  };

  const handlePointerLeave = () => {
    hoverTileRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    const tile = screenToTile(e.clientX, e.clientY);
    if (!tile) return;
    hoverTileRef.current = tile;
    triggerEditAt(tile.x, tile.y);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const tile = screenToTile(e.clientX, e.clientY);
    const map = mapRef.current;
    if (!tile || !map) return;
    // Right-click always clears/breaks quickly
    const idx = tileIndex(tile.x, tile.y, map.width);
    if (map.objects[idx] !== ObjectTile.NONE) {
      propsRef.current.onRequestEdit(tile.x, tile.y, 'object', ObjectTile.NONE);
    } else if (map.ground[idx] !== GroundTile.GRASS) {
      propsRef.current.onRequestEdit(tile.x, tile.y, 'ground', GroundTile.GRASS);
    }
  };

  const bindDir = (dir: keyof typeof dpadRef.current) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      dpadRef.current[dir] = true;
    },
    onPointerUp: () => {
      dpadRef.current[dir] = false;
    },
    onPointerLeave: () => {
      dpadRef.current[dir] = false;
    },
    onPointerCancel: () => {
      dpadRef.current[dir] = false;
    },
  });

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#18241E] select-none">
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
        className="h-full w-full block cursor-crosshair pixelated touch-none"
        aria-label="Pixelfield interactive multiplayer village world"
      />

      {/* Toggleable Live Minimap */}
      {showMinimap && (
        <div className="pointer-events-none fixed left-3 top-16 z-20 overflow-hidden rounded-lg border border-white/15 bg-[#16201C]/90 p-1.5 shadow-xl backdrop-blur-sm sm:left-4">
          <canvas
            ref={minimapCanvasRef}
            className="block h-[132px] w-[176px] rounded-xs pixelated"
            aria-label="Village minimap"
          />
        </div>
      )}

      {/* Mobile Touch Controls (shown on touch devices or narrow viewports) */}
      {isTouchDevice && (
        <div className="pointer-events-none fixed inset-x-4 bottom-24 z-20 flex items-end justify-between md:hidden">
          <div className="pointer-events-auto grid grid-cols-3 gap-1.5">
            <div />
            <button
              type="button"
              {...bindDir('up')}
              aria-label="Move up"
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/15 bg-[#1B2622]/85 text-[#F6F5F0] active:bg-[#2D6A4F]"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
            <div />
            <button
              type="button"
              {...bindDir('left')}
              aria-label="Move left"
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/15 bg-[#1B2622]/85 text-[#F6F5F0] active:bg-[#2D6A4F]"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              {...bindDir('down')}
              aria-label="Move down"
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/15 bg-[#1B2622]/85 text-[#F6F5F0] active:bg-[#2D6A4F]"
            >
              <ArrowDown className="h-5 w-5" />
            </button>
            <button
              type="button"
              {...bindDir('right')}
              aria-label="Move right"
              className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/15 bg-[#1B2622]/85 text-[#F6F5F0] active:bg-[#2D6A4F]"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={triggerActionInFront}
            aria-label={buildMode === 'build' ? 'Place tile ahead' : 'Clear tile ahead'}
            className="pointer-events-auto flex h-14 items-center gap-2 rounded-lg border border-white/20 bg-[#2D6A4F] px-4 text-sm font-semibold text-white shadow-lg active:scale-95"
          >
            {buildMode === 'build' ? <Hammer className="h-4 w-4" /> : <Eraser className="h-4 w-4" />}
            <span>{buildMode === 'build' ? 'Place' : 'Clear'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
