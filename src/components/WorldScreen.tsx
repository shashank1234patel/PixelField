import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  Eraser,
  Flag,
  Hammer,
  HelpCircle,
  LogOut,
  MessageSquare,
  RotateCcw,
  Send,
  Settings,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getPaletteSwatchDataUrl } from '../game/pixelSprites.ts';
import { soundFx } from '../game/sound.ts';
import type { ConnectionState, LivePlayerEntity } from '../hooks/useRoomSocket.ts';
import type {
  BuildPolicy,
  ChatMessagePayload,
  FacingDir,
  RoomPlayerState,
  RoomSummary,
  RoomVisibility,
} from '../shared/protocol.ts';
import type { WorldMapData } from '../shared/starterMap.ts';
import { BUILD_PALETTE, type PaletteItem, type TileLayer } from '../shared/tiles.ts';
import { VillageCanvas } from './VillageCanvas.tsx';

interface WorldScreenProps {
  room: RoomSummary;
  selfUid: string;
  players: RoomPlayerState[];
  chatMessages: ChatMessagePayload[];
  connectionState: ConnectionState;
  canUndo: boolean;
  toast: { id: number; text: string; tone: 'info' | 'error' } | null;
  reducedMotion: boolean;
  mapRef: React.RefObject<WorldMapData | null>;
  playersRef: React.RefObject<Map<string, LivePlayerEntity>>;
  onSendMove: (seq: number, x: number, y: number, facing: FacingDir, walking: boolean) => void;
  onRequestEdit: (tileX: number, tileY: number, layer: TileLayer, tileId: number) => void;
  onRequestUndo: () => void;
  onSendChat: (text: string) => void;
  onReportPlayer: (targetUid: string, reason: string) => void;
  onUpdateSettings: (settings: {
    visibility?: RoomVisibility;
    capacity?: number;
    allowLateJoin?: boolean;
    buildPolicy?: BuildPolicy;
  }) => void;
  onKickPlayer: (targetUid: string, ban?: boolean) => void;
  onTransferHost: (targetUid: string) => void;
  onCloseRoom: () => void;
  onLeave: () => void;
}

export const WorldScreen: React.FC<WorldScreenProps> = ({
  room,
  selfUid,
  players,
  chatMessages,
  connectionState,
  canUndo,
  toast,
  reducedMotion,
  mapRef,
  playersRef,
  onSendMove,
  onRequestEdit,
  onRequestUndo,
  onSendChat,
  onReportPlayer,
  onUpdateSettings,
  onKickPlayer,
  onTransferHost,
  onCloseRoom,
  onLeave,
}) => {
  const [buildMode, setBuildMode] = useState<'build' | 'break'>('build');
  const [selectedItem, setSelectedItem] = useState<PaletteItem>(BUILD_PALETTE[0]);
  const [showAllPalette, setShowAllPalette] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [mutedAudio, setMutedAudio] = useState(false);
  const [coords, setCoords] = useState({ x: 31, y: 26 });

  const [panelOpen, setPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [panelTab, setPanelTab] = useState<'chat' | 'roster'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [mutedUids, setMutedUids] = useState<Set<string>>(new Set());
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHostSettings, setShowHostSettings] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  const self = players.find((p) => p.uid === selfUid);
  const isHost = self?.role === 'host' || room.ownerUid === selfUid;
  const connectedCount = players.filter((p) => p.connected).length;

  const quickSlots = useMemo(() => BUILD_PALETTE.slice(0, 9), []);

  // Pre-render crisp pixel-art palette swatches once
  const swatches = useMemo(() => {
    const out: Record<string, string> = {};
    for (const item of BUILD_PALETTE) {
      out[item.id] = getPaletteSwatchDataUrl(item.layer, item.tileId);
    }
    return out;
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [chatMessages.length, panelOpen, panelTab, reducedMotion]);

  // Global keyboard shortcuts for hotbar, build/break, undo, and chat focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        if (quickSlots[idx]) {
          setSelectedItem(quickSlots[idx]);
          setBuildMode('build');
        }
      } else if (e.key.toLowerCase() === 'b') {
        setBuildMode((m) => (m === 'build' ? 'break' : 'build'));
      } else if (e.key.toLowerCase() === 'z' && !e.metaKey && !e.ctrlKey) {
        onRequestUndo();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setPanelOpen(true);
        setPanelTab('chat');
        setTimeout(() => chatInputRef.current?.focus(), 30);
      } else if (e.key === '?') {
        setShowHelp((v) => !v);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickSlots, onRequestUndo]);

  const handleCopyInvite = async () => {
    const inviteUrl = `${window.location.origin}/?join=${encodeURIComponent(room.shortCode)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleToggleAudio = () => {
    const next = !mutedAudio;
    setMutedAudio(next);
    soundFx.muted = next;
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChatInput('');
  };

  const toggleMutePlayer = (uid: string) => {
    setMutedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const visibleMessages = chatMessages.filter(
    (m) => m.kind === 'system' || !mutedUids.has(m.senderUid)
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#141C19] text-[#F4F3EE]">
      {/* Full-bleed interactive village canvas */}
      <VillageCanvas
        mapRef={mapRef}
        playersRef={playersRef}
        selfUid={selfUid}
        buildMode={buildMode}
        selectedItem={selectedItem}
        buildPolicy={room.buildPolicy}
        zoom={zoom}
        reducedMotion={reducedMotion}
        onSendMove={onSendMove}
        onRequestEdit={onRequestEdit}
        onCoordsChange={(x, y) => setCoords({ x, y })}
      />

      {/* Compact Top HUD Bar */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-white/12 bg-[#16201C]/90 px-3.5 py-2 backdrop-blur-sm max-w-[65vw]">
          <span className="font-display text-sm font-semibold text-white truncate">{room.name}</span>
          <span className="hidden sm:inline text-white/30" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={handleCopyInvite}
            title="Copy shareable invite link"
            className="hidden sm:flex items-center gap-1.5 font-mono text-xs text-[#C7D4CC] hover:text-white whitespace-nowrap shrink-0"
          >
            <span>{room.shortCode}</span>
            {copiedInvite ? (
              <Check className="h-3.5 w-3.5 text-[#52B788]" />
            ) : (
              <Copy className="h-3.5 w-3.5 opacity-75" />
            )}
          </button>
          <span className="hidden md:inline text-white/30" aria-hidden="true">
            ·
          </span>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-[#B6C4BC] tabular-nums whitespace-nowrap shrink-0">
            <span
              className={`h-2 w-2 rounded-full ${
                connectionState === 'connected' ? 'bg-[#52B788]' : 'bg-[#E9B949]'
              }`}
            />
            <span>
              {connectionState === 'connected'
                ? `${connectedCount}/${room.capacity} online`
                : 'Reconnecting…'}
            </span>
          </div>
          <span className="hidden lg:inline text-white/30" aria-hidden="true">
            ·
          </span>
          <span className="hidden lg:inline font-mono text-xs text-[#91A398] tabular-nums whitespace-nowrap shrink-0">
            {coords.x}, {coords.y}
          </span>
        </div>

        {/* Right HUD utility controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#16201C]/90 p-1.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1.5, z - 0.5))}
            title="Zoom out"
            aria-label="Zoom out"
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md text-[#C7D4CC] hover:bg-white/10 hover:text-white"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
            title="Zoom in"
            aria-label="Zoom in"
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md text-[#C7D4CC] hover:bg-white/10 hover:text-white"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleToggleAudio}
            title={mutedAudio ? 'Unmute sound effects' : 'Mute sound effects'}
            aria-label={mutedAudio ? 'Unmute sound' : 'Mute sound'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#C7D4CC] hover:bg-white/10 hover:text-white"
          >
            {mutedAudio ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (panelOpen && panelTab === 'chat') setPanelOpen(false);
              else {
                setPanelTab('chat');
                setPanelOpen(true);
              }
            }}
            title="Toggle room chat"
            aria-label="Toggle room chat"
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              panelOpen && panelTab === 'chat'
                ? 'bg-[#2D6A4F] text-white'
                : 'text-[#C7D4CC] hover:bg-white/10 hover:text-white'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chat</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (panelOpen && panelTab === 'roster') setPanelOpen(false);
              else {
                setPanelTab('roster');
                setPanelOpen(true);
              }
            }}
            title="Toggle villager roster"
            aria-label="Toggle villager roster"
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium tabular-nums transition-colors whitespace-nowrap ${
              panelOpen && panelTab === 'roster'
                ? 'bg-[#2D6A4F] text-white'
                : 'text-[#C7D4CC] hover:bg-white/10 hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>{connectedCount}</span>
          </button>
          {isHost && (
            <button
              type="button"
              onClick={() => setShowHostSettings(true)}
              title="Host room settings"
              aria-label="Host room settings"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#C7D4CC] hover:bg-white/10 hover:text-white"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            title="Controls & Help"
            aria-label="Controls and help"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#C7D4CC] hover:bg-white/10 hover:text-white"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onLeave}
            title="Leave village"
            aria-label="Leave village"
            className="flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-[#E8B4AE] hover:bg-[#9B2C2C]/30 hover:text-white whitespace-nowrap"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Live server feedback toast (e.g. out of range / protected well / rate limit) */}
      {toast && (
        <div
          role="status"
          className={`fixed left-1/2 top-16 z-40 -translate-x-1/2 rounded-lg border px-4 py-2 text-xs font-medium shadow-lg ${
            toast.tone === 'error'
              ? 'border-[#C95B50]/60 bg-[#2C1816]/95 text-[#FFD8D4]'
              : 'border-white/15 bg-[#16201C]/95 text-[#E8F2EC]'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Reconnecting banner when socket is temporarily offline */}
      {connectionState === 'reconnecting' && (
        <div className="fixed left-1/2 top-16 z-40 -translate-x-1/2 rounded-lg border border-[#C87D28]/60 bg-[#2A2013]/95 px-4 py-2 text-xs font-medium text-[#FCE5B8]">
          Connection interrupted — restoring your villager seat…
        </div>
      )}

      {/* Right Collapsible Chat & Roster Drawer */}
      {panelOpen && (
        <aside className="fixed right-3 top-16 bottom-24 z-30 flex w-[calc(100vw-24px)] max-w-80 flex-col overflow-hidden rounded-xl border border-white/12 bg-[#16201C]/92 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-1 rounded-md bg-black/25 p-0.5">
              <button
                type="button"
                onClick={() => setPanelTab('chat')}
                className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
                  panelTab === 'chat' ? 'bg-[#2D6A4F] text-white' : 'text-[#A8B8AF] hover:text-white'
                }`}
              >
                Room Chat
              </button>
              <button
                type="button"
                onClick={() => setPanelTab('roster')}
                className={`rounded-sm px-3 py-1 text-xs font-medium tabular-nums transition-colors ${
                  panelTab === 'roster' ? 'bg-[#2D6A4F] text-white' : 'text-[#A8B8AF] hover:text-white'
                }`}
              >
                Villagers ({connectedCount}/{room.capacity})
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="Close panel"
              className="rounded-md p-1 text-[#A8B8AF] hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {panelTab === 'chat' ? (
            <>
              <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 text-xs">
                {visibleMessages.length === 0 ? (
                  <p className="text-[#8FA096]">
                    Say hello to your neighbors. Chat stays inside this room and is not stored permanently.
                  </p>
                ) : (
                  visibleMessages.map((m) => (
                    <div key={m.id} className="leading-relaxed break-words">
                      {m.kind === 'system' ? (
                        <span className="text-[#8FA096] italic">{m.text}</span>
                      ) : (
                        <>
                          <span className="font-mono text-[10px] text-[#7D8F84] mr-1.5 tabular-nums">
                            {new Date(m.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="font-semibold text-[#E8F3EC] mr-1.5">{m.senderName}:</span>
                          <span className="text-[#D4DFD8]">{m.text}</span>
                        </>
                      )}
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleChatSubmit} className="border-t border-white/10 p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    maxLength={240}
                    placeholder="Message village… (Enter)"
                    className="flex-1 rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-[#84958B] focus:border-[#52B788] focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2D6A4F] text-white hover:bg-[#3A8463]"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-white/8 px-3 py-1">
              {players.map((p) => {
                const isMe = p.uid === selfUid;
                const isMuted = mutedUids.has(p.uid);
                return (
                  <div key={p.uid} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="h-7 w-7 shrink-0 rounded-md border border-white/15"
                        style={{ backgroundColor: p.avatarColor }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-xs font-semibold text-white truncate">
                          <span className="truncate">{p.displayName}</span>
                          {isMe && <span className="text-[#8FA096] font-normal">(You)</span>}
                          {p.role === 'host' && <Crown className="h-3 w-3 text-[#E9B949] shrink-0" />}
                        </div>
                        <div className="text-[11px] text-[#8FA096]">
                          {p.connected ? 'In village' : 'Reconnecting…'}
                        </div>
                      </div>
                    </div>

                    {!isMe && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleMutePlayer(p.uid)}
                          title={isMuted ? 'Unmute in chat' : 'Mute in chat'}
                          className={`rounded px-2 py-1 text-[11px] ${
                            isMuted
                              ? 'bg-[#C87D28]/30 text-[#FCE5B8]'
                              : 'text-[#A8B8AF] hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {isMuted ? 'Muted' : 'Mute'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onReportPlayer(p.uid, 'Reported from village roster')}
                          title="Report player"
                          aria-label={`Report ${p.displayName}`}
                          className="rounded p-1 text-[#A8B8AF] hover:bg-white/10 hover:text-[#FCE5B8]"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                        {isHost && (
                          <>
                            <button
                              type="button"
                              onClick={() => onTransferHost(p.uid)}
                              title="Transfer host"
                              aria-label={`Transfer host to ${p.displayName}`}
                              className="rounded p-1 text-[#A8B8AF] hover:bg-white/10 hover:text-[#E9B949]"
                            >
                              <Crown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onKickPlayer(p.uid, false)}
                              title="Remove from village"
                              aria-label={`Kick ${p.displayName}`}
                              className="rounded p-1 text-[#E8B4AE] hover:bg-[#9B2C2C]/40 hover:text-white"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      )}

      {/* Bottom Compact Hotbar & Expandable Full Tile Tray */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 px-3">
        {showAllPalette && (
          <div className="pointer-events-auto grid max-w-xl grid-cols-5 gap-1.5 rounded-xl border border-white/14 bg-[#16201C]/95 p-3 shadow-xl backdrop-blur-md sm:grid-cols-5">
            {BUILD_PALETTE.map((item) => {
              const active = buildMode === 'build' && selectedItem.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedItem(item);
                    setBuildMode('build');
                    setShowAllPalette(false);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] transition-colors ${
                    active
                      ? 'border-[#52B788] bg-[#2D6A4F]/40 text-white'
                      : 'border-white/8 bg-black/20 text-[#C7D4CC] hover:bg-white/10'
                  }`}
                >
                  <img
                    src={swatches[item.id]}
                    alt={item.label}
                    className="h-8 w-8 rounded-xs pixelated"
                  />
                  <span className="truncate w-full text-center">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-white/14 bg-[#16201C]/92 p-1.5 shadow-xl backdrop-blur-md">
          {/* Build / Break mode toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-black/30 p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setBuildMode('build')}
              title="Build mode (B)"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                buildMode === 'build' ? 'bg-[#2D6A4F] text-white' : 'text-[#A8B8AF] hover:text-white'
              }`}
            >
              <Hammer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Build</span>
            </button>
            <button
              type="button"
              onClick={() => setBuildMode('break')}
              title="Clear tile mode (B or Right-click)"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                buildMode === 'break' ? 'bg-[#C87D28] text-white' : 'text-[#A8B8AF] hover:text-white'
              }`}
            >
              <Eraser className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>

          <div className="h-7 w-px bg-white/12 shrink-0" />

          {/* 9 Hotbar Tile Swatches */}
          <div className="flex items-center gap-1 shrink-0">
            {quickSlots.map((item, idx) => {
              const active = buildMode === 'build' && selectedItem.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedItem(item);
                    setBuildMode('build');
                  }}
                  title={`${item.label} (${idx + 1})`}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-lg border transition-transform ${
                    active
                      ? 'border-[#52B788] bg-[#2D6A4F]/50 -translate-y-0.5'
                      : 'border-white/10 bg-black/25 hover:bg-white/10'
                  }`}
                >
                  <img
                    src={swatches[item.id]}
                    alt={item.label}
                    className="h-7 w-7 rounded-xs pixelated"
                  />
                  <span className="absolute right-1 top-0.5 font-mono text-[9px] text-white/70">
                    {idx + 1}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowAllPalette((v) => !v)}
            title="Show all buildable tiles"
            aria-label="Toggle full tile palette"
            className="flex h-11 items-center gap-1 rounded-lg border border-white/10 bg-black/25 px-2.5 text-xs font-medium text-[#C7D4CC] hover:bg-white/10 hover:text-white shrink-0 whitespace-nowrap"
          >
            <span>All</span>
            {showAllPalette ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>

          <div className="h-7 w-px bg-white/12 shrink-0" />

          {/* Undo own last placement */}
          <button
            type="button"
            onClick={onRequestUndo}
            disabled={!canUndo}
            title="Undo your last placement (Z)"
            className="flex h-11 items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-3 text-xs font-medium text-[#E8F3EC] hover:bg-white/10 disabled:opacity-40 shrink-0 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </button>
        </div>
      </div>

      {/* Host Live Settings Modal */}
      {showHostSettings && isHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#1B2622] p-6 text-[#F4F3EE] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-xl font-semibold">Host Village Settings</h2>
              <button
                type="button"
                onClick={() => setShowHostSettings(false)}
                className="rounded p-1 text-[#A8B8AF] hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs text-[#A8B8AF]">Visibility</label>
                <select
                  value={room.visibility}
                  onChange={(e) => onUpdateSettings({ visibility: e.target.value as RoomVisibility })}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="code">Code Only</option>
                  <option value="link">Friends with Invite Link</option>
                  <option value="open">Open Discovery</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#A8B8AF]">Building Policy</label>
                <select
                  value={room.buildPolicy}
                  onChange={(e) => onUpdateSettings({ buildPolicy: e.target.value as BuildPolicy })}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="everyone">Everyone can build</option>
                  <option value="build_zones">Marked build zones only</option>
                  <option value="host_only">Host only</option>
                </select>
              </div>

              <div>
                <label className="flex items-center justify-between text-xs text-[#A8B8AF]">
                  <span>Maximum capacity (10–15)</span>
                  <span className="font-mono font-semibold text-white tabular-nums">{room.capacity}</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={15}
                  value={room.capacity}
                  onChange={(e) => onUpdateSettings({ capacity: Number(e.target.value) })}
                  className="mt-2 w-full accent-[#52B788]"
                />
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-[#D4DFD8]">Allow late arrivals</span>
                <input
                  type="checkbox"
                  checked={room.allowLateJoin}
                  onChange={(e) => onUpdateSettings({ allowLateJoin: e.target.checked })}
                  className="h-4 w-4 accent-[#52B788]"
                />
              </label>

              <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onCloseRoom}
                  className="rounded-lg bg-[#9B2C2C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#7D2222]"
                >
                  Close Village Room
                </button>
                <button
                  type="button"
                  onClick={() => setShowHostSettings(false)}
                  className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3A8463]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls & Help Overlay */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#1B2622] p-6 text-[#F4F3EE] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-xl font-semibold">Controls & Village Guide</h2>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="rounded p-1 text-[#A8B8AF] hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Walk around</dt>
                <dd className="font-mono text-white">WASD / Arrow keys / Touch D-pad</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Place selected tile</dt>
                <dd className="font-mono text-white">Left-click or Space</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Clear object or ground</dt>
                <dd className="font-mono text-white">Right-click or Clear mode (B)</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Select hotbar tile</dt>
                <dd className="font-mono text-white">Keys 1 – 9</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Undo your last edit</dt>
                <dd className="font-mono text-white">Key Z</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Open room chat</dt>
                <dd className="font-mono text-white">Enter</dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-[#9BB0A4]">
              All builds autosave to the server every few seconds. The central village well and lakeside lantern tower are protected landmarks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
