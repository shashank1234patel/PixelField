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
  TILE_SIZE,
  type TileLayer,
  WORLD_HEIGHT,
  WORLD_WIDTH,
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
  onSendMove: (seq: number, x: number, y: number, facing: FacingDir, walking: boolean) => void;
  onRequestEdit: (tileX: number, tileY: number, layer: TileLayer, tileId: number) => void;
  onCoordsChange?: (x: number, y: number) => void;
}

const MOVE_SPEED = 5.4; // tiles/sec
const MAX_REACH = 6.2;

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
    if (tx < 0 || tx >= WORLD_WIDTH || ty < 0 || ty >= WORLD_HEIGHT) return true;
    const idx = tileIndex(tx, ty);
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
  onSendMove,
  onRequestEdit,
  onCoordsChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const dpadRef = useRef({ up: false, down: false, left: false, right: false });
  const hoverTileRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef({ x: 31 * TILE_SIZE, y: 26 * TILE_SIZE });
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
    if (tx < 0 || tx >= WORLD_WIDTH || ty < 0 || ty >= WORLD_HEIGHT) return;
    const { buildMode: mode, selectedItem: item, onRequestEdit: editFn } = propsRef.current;
    if (mode === 'break') {
      const idx = tileIndex(tx, ty);
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

          const nextX = Math.max(0.5, Math.min(WORLD_WIDTH - 1.5, self.renderX + dx * MOVE_SPEED * dt));
          const nextY = Math.max(0.5, Math.min(WORLD_HEIGHT - 1.5, self.renderY + dy * MOVE_SPEED * dt));

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

        // Smooth camera follow clamped to world edges
        const targetCamX = (self.renderX + 0.5) * scaledTile - viewW / 2;
        const targetCamY = (self.renderY + 0.5) * scaledTile - viewH / 2;
        const maxCamX = Math.max(0, WORLD_WIDTH * scaledTile - viewW);
        const maxCamY = Math.max(0, WORLD_HEIGHT * scaledTile - viewH);
        const clampedCamX = Math.max(0, Math.min(maxCamX, targetCamX));
        const clampedCamY = Math.max(0, Math.min(maxCamY, targetCamY));

        const camLerp = lowEffects ? 1 : Math.min(1, dt * 9);
        cameraRef.current.x += (clampedCamX - cameraRef.current.x) * camLerp;
        cameraRef.current.y += (clampedCamY - cameraRef.current.y) * camLerp;
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
        const endCol = Math.min(WORLD_WIDTH - 1, Math.ceil((camX + viewW) / scaledTile) + 1);
        const startRow = Math.max(0, Math.floor(camY / scaledTile) - 1);
        const endRow = Math.min(WORLD_HEIGHT - 1, Math.ceil((camY + viewH) / scaledTile) + 1);

        const waterFrameIdx = lowEffects ? 0 : Math.floor(animTime * 2.5) % atlas.waterFrames.length;
        const lampPositions: Array<{ sx: number; sy: number; big: boolean }> = [];

        // Ground layer
        for (let ty = startRow; ty <= endRow; ty++) {
          for (let tx = startCol; tx <= endCol; tx++) {
            const idx = tileIndex(tx, ty);
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
            if (policy === 'build_zones' && isInBuildZone(tx, ty)) {
              ctx.fillStyle = 'rgba(255, 243, 176, 0.08)';
              ctx.fillRect(sx, sy, scaledTile, scaledTile);
            }
          }
        }

        // Object layer
        for (let ty = startRow; ty <= endRow; ty++) {
          for (let tx = startCol; tx <= endCol; tx++) {
            const idx = tileIndex(tx, ty);
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
          const protectedTile = isProtectedLandmarkTile(hover.x, hover.y);
          const allowedZone = policy !== 'build_zones' || self.role !== 'player' || isInBuildZone(hover.x, hover.y);
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
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaledTile = TILE_SIZE * propsRef.current.zoom;
    const tx = Math.floor((clientX - rect.left + cameraRef.current.x) / scaledTile);
    const ty = Math.floor((clientY - rect.top + cameraRef.current.y) / scaledTile);
    if (tx < 0 || tx >= WORLD_WIDTH || ty < 0 || ty >= WORLD_HEIGHT) return null;
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
    if (!tile || !mapRef.current) return;
    // Right-click always clears/breaks quickly
    const idx = tileIndex(tile.x, tile.y);
    if (mapRef.current.objects[idx] !== ObjectTile.NONE) {
      propsRef.current.onRequestEdit(tile.x, tile.y, 'object', ObjectTile.NONE);
    } else if (mapRef.current.ground[idx] !== GroundTile.GRASS) {
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
