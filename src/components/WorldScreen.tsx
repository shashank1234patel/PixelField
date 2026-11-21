import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Crown,
  Flag,
  HelpCircle,
  LogOut,
  Map as MapIcon,
  MessageSquare,
  Search,
  Send,
  Settings,
  Sparkles,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { soundFx } from '../game/sound.ts';
import type {
  ConnectionState,
  LivePlayerEntity,
  PuzzleFeedbackState,
} from '../hooks/useRoomSocket.ts';
import {
  type AdventureNodeDef,
  type AdventureNotification,
  type AdventureState,
  getActiveQuest,
  getStoryProgressMetrics,
} from '../shared/adventureData.ts';
import type {
  BuildPolicy,
  ChatMessagePayload,
  FacingDir,
  RoomPlayerState,
  RoomSummary,
  RoomVisibility,
} from '../shared/protocol.ts';
import type { WorldMapData } from '../shared/starterMap.ts';
import { SPAWN_TILE } from '../shared/tiles.ts';
import {
  DialLockPuzzleModal,
  EmblemOrderPuzzleModal,
  FieldJournalModal,
  NodeInspectionModal,
} from './AdventureModals.tsx';
import { VillageCanvas } from './VillageCanvas.tsx';

interface WorldScreenProps {
  room: RoomSummary;
  selfUid: string;
  players: RoomPlayerState[];
  chatMessages: ChatMessagePayload[];
  adventure: AdventureState;
  adventureBanner: AdventureNotification | null;
  puzzleFeedback: PuzzleFeedbackState | null;
  connectionState: ConnectionState;
  worldVersion: number;
  toast: { id: number; text: string; tone: 'info' | 'error' } | null;
  reducedMotion: boolean;
  mapRef: React.RefObject<WorldMapData | null>;
  playersRef: React.RefObject<Map<string, LivePlayerEntity>>;
  onSendMove: (seq: number, x: number, y: number, facing: FacingDir, walking: boolean) => void;
  onInteractNode: (nodeId: string) => void;
  onSolvePuzzle: (nodeId: string, answer: string | string[]) => void;
  onDismissAdventureBanner: () => void;
  onClearPuzzleFeedback: () => void;
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
  adventure,
  adventureBanner,
  puzzleFeedback,
  connectionState,
  worldVersion,
  toast,
  reducedMotion,
  mapRef,
  playersRef,
  onSendMove,
  onInteractNode,
  onSolvePuzzle,
  onDismissAdventureBanner,
  onClearPuzzleFeedback,
  onSendChat,
  onReportPlayer,
  onUpdateSettings,
  onKickPlayer,
  onTransferHost,
  onCloseRoom,
  onLeave,
}) => {
  const [zoom, setZoom] = useState(2);
  const [mutedAudio, setMutedAudio] = useState(() => soundFx.getMuted());
  const [coords, setCoords] = useState({ x: SPAWN_TILE.x, y: SPAWN_TILE.y });
  const [showMinimap, setShowMinimap] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [questPanelExpanded, setQuestPanelExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  const [panelOpen, setPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1200 : false
  );
  const [panelTab, setPanelTab] = useState<'chat' | 'roster'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [mutedUids, setMutedUids] = useState<Set<string>>(new Set());
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHostSettings, setShowHostSettings] = useState(false);

  const [nearbyNode, setNearbyNode] = useState<AdventureNodeDef | null>(null);
  const [inspectedNode, setInspectedNode] = useState<AdventureNodeDef | null>(null);
  const [showJournal, setShowJournal] = useState(false);
  const [journalInitialTab, setJournalInitialTab] = useState<'quests' | 'clues' | 'satchel'>('quests');

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  const self = players.find((p) => p.uid === selfUid);
  const isHost = self?.role === 'host' || room.ownerUid === selfUid;
  const connectedCount = players.filter((p) => p.connected).length;

  const progress = getStoryProgressMetrics(adventure);
  const activeQuest = getActiveQuest(adventure);

  const anyModalOpen = Boolean(inspectedNode || showJournal || showHelp || showHostSettings);

  useEffect(() => {
    const unsub = soundFx.subscribe(setMutedAudio);
    const unlockAmbient = () => {
      soundFx.startAmbient();
    };
    soundFx.startAmbient();
    window.addEventListener('pointerdown', unlockAmbient, { once: true });
    window.addEventListener('keydown', unlockAmbient, { once: true });
    return () => {
      unsub();
      window.removeEventListener('pointerdown', unlockAmbient);
      window.removeEventListener('keydown', unlockAmbient);
      soundFx.stopAmbient();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [chatMessages.length, panelOpen, panelTab, reducedMotion]);

  const handleInspectNode = useCallback(
    (node: AdventureNodeDef) => {
      onClearPuzzleFeedback();
      onInteractNode(node.id);
      setInspectedNode(node);
    },
    [onInteractNode, onClearPuzzleFeedback]
  );

  const openJournalTo = useCallback((tab: 'quests' | 'clues' | 'satchel' = 'quests') => {
    setInspectedNode(null);
    setJournalInitialTab(tab);
    setShowJournal(true);
  }, []);

  // Global keyboard shortcuts: J (Journal), M (Minimap), Enter (Chat), ? (Help), Esc (Close modals)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (inspectedNode) {
          setInspectedNode(null);
        } else if (showJournal) {
          setShowJournal(false);
        } else if (showHelp) {
          setShowHelp(false);
        } else if (showHostSettings) {
          setShowHostSettings(false);
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'j') {
        e.preventDefault();
        setInspectedNode(null);
        setShowJournal((v) => !v);
      } else if (key === 'm' && !anyModalOpen) {
        setShowMinimap((v) => !v);
      } else if (e.key === 'Enter' && !anyModalOpen) {
        e.preventDefault();
        setPanelOpen(true);
        setPanelTab('chat');
        setTimeout(() => chatInputRef.current?.focus(), 30);
      } else if (e.key === '?' && !inspectedNode) {
        setShowHelp((v) => !v);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anyModalOpen, inspectedNode, showJournal, showHelp, showHostSettings]);

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
    soundFx.toggleMuted();
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
      {/* Full-bleed interactive village adventure canvas */}
      <VillageCanvas
        mapRef={mapRef}
        playersRef={playersRef}
        selfUid={selfUid}
        adventure={adventure}
        zoom={zoom}
        reducedMotion={reducedMotion}
        showMinimap={showMinimap}
        worldVersion={worldVersion}
        interactionDisabled={anyModalOpen}
        onSendMove={onSendMove}
        onInspectNode={handleInspectNode}
        onNearbyNodeChange={setNearbyNode}
        onCoordsChange={(x, y) => setCoords({ x, y })}
      />

      {/* BOTTOM-LEFT COMPACT QUEST & STORY PROGRESS PANEL */}
      <section
        aria-label="Quest and story progress"
        className="fixed left-3 bottom-3 z-30 w-[calc(100vw-24px)] max-w-[304px] rounded-xl border border-[#D8C58E]/30 bg-[#16201C]/92 text-[#F4F3EE] shadow-xl backdrop-blur-md sm:left-4 sm:bottom-4"
      >
        <button
          type="button"
          onClick={() => setQuestPanelExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
          aria-expanded={questPanelExpanded}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold tracking-wide text-[#EBD28E]">
                {adventure.chapterTitle}
              </span>
              <span className="font-mono text-[11px] font-semibold text-[#D6E3DC] tabular-nums shrink-0">
                {progress.completedCount}/{progress.totalCount} · {progress.percent}%
              </span>
            </div>
            {/* Progress Bar */}
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full rounded-full bg-[#52B788] transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
          <span className="text-[#A8B8AF] shrink-0">
            {questPanelExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>

        {questPanelExpanded && (
          <div className="border-t border-white/10 px-3.5 py-2.5 space-y-2">
            {progress.isComplete ? (
              <p className="text-xs leading-relaxed text-[#CDE8D6]">
                All 8 quests complete! Pixelfield&apos;s Free Charter and Golden Astrolabe have been recovered.
              </p>
            ) : activeQuest ? (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Compass className="h-3.5 w-3.5 text-[#F4C95D] shrink-0" />
                  <span className="truncate">{activeQuest.title}</span>
                </div>
                <p className="mt-1 text-xs leading-snug text-[#C7D4CC]">
                  {activeQuest.shortObjective}
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
              <span className="text-[#96A89D] truncate">
                {activeQuest ? activeQuest.targetAreaLabel : 'Free Exploration'}
              </span>
              <button
                type="button"
                onClick={() => openJournalTo('quests')}
                className="flex items-center gap-1 font-semibold text-[#7AD9A8] hover:text-white whitespace-nowrap shrink-0"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Journal &amp; Hints (J)</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* TOP-RIGHT COMPACT UTILITY BAR */}
      <header className="pointer-events-none fixed right-3 top-3 z-30 flex items-center gap-2 sm:right-4">
        <div className="pointer-events-auto hidden xl:flex items-center gap-2.5 rounded-lg border border-white/12 bg-[#16201C]/90 px-3 py-2 backdrop-blur-sm">
          <span className="font-display text-xs font-semibold text-white max-w-[150px] truncate">
            {room.name}
          </span>
          <span className="text-white/25" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={handleCopyInvite}
            title="Copy shareable invite link"
            className="flex items-center gap-1 font-mono text-xs text-[#C7D4CC] hover:text-white whitespace-nowrap"
          >
            <span>{room.shortCode}</span>
            {copiedInvite ? (
              <Check className="h-3.5 w-3.5 text-[#52B788]" />
            ) : (
              <Copy className="h-3.5 w-3.5 opacity-75" />
            )}
          </button>
          <span className="text-white/25" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-xs text-[#91A398] tabular-nums whitespace-nowrap">
            {coords.x}, {coords.y}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/12 bg-[#16201C]/90 p-1.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleCopyInvite}
            title={`Copy invite link (${room.shortCode})`}
            aria-label="Copy invite link"
            className="flex xl:hidden h-8 items-center gap-1 rounded-md px-2 font-mono text-xs text-[#C7D4CC] hover:bg-white/10 hover:text-white whitespace-nowrap"
          >
            <span className="hidden sm:inline">{room.shortCode}</span>
            {copiedInvite ? (
              <Check className="h-3.5 w-3.5 text-[#52B788]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => openJournalTo('quests')}
            title="Open Field Journal (J)"
            aria-label="Open Field Journal"
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              showJournal
                ? 'bg-[#2D6A4F] text-white'
                : 'text-[#EBD28E] hover:bg-white/10 hover:text-white'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Journal</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMinimap((v) => !v)}
            title="Toggle village minimap (M)"
            aria-label="Toggle village minimap"
            className={`hidden md:flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
              showMinimap
                ? 'bg-[#2D6A4F] text-white'
                : 'text-[#C7D4CC] hover:bg-white/10 hover:text-white'
            }`}
          >
            <MapIcon className="h-4 w-4" />
            <span className="hidden lg:inline">Map</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            title="Zoom out"
            aria-label="Zoom out"
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md text-[#C7D4CC] hover:bg-white/10 hover:text-white"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
            title="Zoom in"
            aria-label="Zoom in"
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md text-[#C7D4CC] hover:bg-white/10 hover:text-white"
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
            title="Toggle room chat (Enter)"
            aria-label="Toggle room chat"
            className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
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
            title="Toggle explorers roster"
            aria-label="Toggle explorers roster"
            className={`flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium tabular-nums transition-colors whitespace-nowrap ${
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
            title="Controls & Adventure Guide (?)"
            aria-label="Controls and adventure guide"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#C7D4CC] hover:bg-white/10 hover:text-white"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onLeave}
            title="Leave expedition"
            aria-label="Leave expedition"
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-[#E8B4AE] hover:bg-[#9B2C2C]/30 hover:text-white whitespace-nowrap"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* REAL-TIME GROUP DISCOVERY NOTIFICATION BANNER */}
      {adventureBanner && (
        <div
          role="status"
          className="fixed left-1/2 top-16 z-40 flex w-[calc(100vw-24px)] max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border border-[#EBD28E]/50 bg-[#1A2822]/96 px-4 py-3 text-left shadow-2xl backdrop-blur-md md:top-4"
        >
          <Sparkles className="mt-0.5 h-4 w-4 text-[#F4C95D] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-[#FCE8B2]">
              {adventureBanner.actorName} · {adventureBanner.title}
            </div>
            <p className="mt-0.5 text-xs leading-snug text-[#DCE7E0]">{adventureBanner.detail}</p>
          </div>
          <button
            type="button"
            onClick={onDismissAdventureBanner}
            aria-label="Dismiss notification"
            className="rounded p-0.5 text-[#9BB0A4] hover:bg-white/10 hover:text-white shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Server feedback toast */}
      {toast && !adventureBanner && (
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

      {/* Reconnecting banner */}
      {connectionState === 'reconnecting' && (
        <div className="fixed left-1/2 top-28 z-40 -translate-x-1/2 rounded-lg border border-[#C87D28]/60 bg-[#2A2013]/95 px-4 py-2 text-xs font-medium text-[#FCE5B8]">
          Connection interrupted — restoring your explorer seat…
        </div>
      )}

      {/* BOTTOM-CENTER PROXIMITY INTERACTION PROMPT */}
      {nearbyNode && !anyModalOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 hidden justify-center px-4 md:flex">
          <button
            type="button"
            onClick={() => handleInspectNode(nearbyNode)}
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-[#EBD28E]/55 bg-[#16201C]/95 px-4 py-2.5 text-sm text-white shadow-xl backdrop-blur-md transition-transform hover:scale-[1.02] hover:border-[#F7D774]"
          >
            <Search className="h-4 w-4 text-[#F4C95D] shrink-0" />
            <span className="font-semibold">{nearbyNode.name}</span>
            <span className="text-white/30" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-xs text-[#EBD28E]">Press E or Click to inspect</span>
          </button>
        </div>
      )}

      {/* Right Collapsible Chat & Roster Drawer */}
      {panelOpen && (
        <aside className="fixed right-3 top-16 bottom-6 z-30 flex w-[calc(100vw-24px)] max-w-80 flex-col overflow-hidden rounded-xl border border-white/12 bg-[#16201C]/92 shadow-xl backdrop-blur-md sm:right-4">
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
                Explorers ({connectedCount}/{room.capacity})
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
                    Share clues and coordinate with your group here. Discoveries appear automatically.
                  </p>
                ) : (
                  visibleMessages.map((m) => (
                    <div key={m.id} className="leading-relaxed break-words">
                      {m.kind === 'system' ? (
                        <span className="text-[#9FD8B7] italic">{m.text}</span>
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
                    placeholder="Share a clue… (Enter)"
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
                          {p.connected ? 'Exploring village' : 'Reconnecting…'}
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
                          onClick={() => onReportPlayer(p.uid, 'Reported from roster')}
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
                              title="Remove from room"
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

      {/* ADVENTURE INSPECTION & PUZZLE MODALS */}
      {inspectedNode && inspectedNode.puzzleType === 'dial_lock' && (
        <DialLockPuzzleModal
          node={inspectedNode}
          adventure={adventure}
          puzzleFeedback={puzzleFeedback}
          onSubmitCode={(code) => onSolvePuzzle(inspectedNode.id, code)}
          onOpenJournal={() => openJournalTo('clues')}
          onClose={() => setInspectedNode(null)}
        />
      )}

      {inspectedNode && inspectedNode.puzzleType === 'emblem_order' && (
        <EmblemOrderPuzzleModal
          node={inspectedNode}
          adventure={adventure}
          puzzleFeedback={puzzleFeedback}
          onSubmitOrder={(order) => onSolvePuzzle(inspectedNode.id, order)}
          onOpenJournal={() => openJournalTo('clues')}
          onClose={() => setInspectedNode(null)}
        />
      )}

      {inspectedNode &&
        inspectedNode.puzzleType !== 'dial_lock' &&
        inspectedNode.puzzleType !== 'emblem_order' && (
          <NodeInspectionModal
            node={inspectedNode}
            adventure={adventure}
            onUnlockVaultChest={() => onSolvePuzzle('founders_vault_chest', 'open_vault')}
            onOpenJournal={() => openJournalTo('clues')}
            onClose={() => setInspectedNode(null)}
          />
        )}

      {/* FIELD JOURNAL MODAL */}
      {showJournal && (
        <FieldJournalModal
          adventure={adventure}
          initialTab={journalInitialTab}
          onClose={() => setShowJournal(false)}
        />
      )}

      {/* Host Live Settings Modal */}
      {showHostSettings && isHost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowHostSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-white/15 bg-[#1B2622] p-6 text-[#F4F3EE] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-xl font-semibold">Expedition Room Settings</h2>
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
                <label className="flex items-center justify-between text-xs text-[#A8B8AF]">
                  <span>Maximum explorers (10–15)</span>
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
                  Close Room
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

      {/* Controls & Adventure Guide Modal */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-white/15 bg-[#1B2622] p-6 text-[#F4F3EE] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-xl font-semibold">Controls &amp; Treasure Hunt Guide</h2>
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
                <dt className="text-[#A8B8AF]">Walk around village</dt>
                <dd className="font-mono text-white">WASD / Arrow keys / Touch D-pad</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Inspect clue, chest, or villager</dt>
                <dd className="font-mono text-white">Key E / Space / Click object</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Field Journal, Clues &amp; Hints</dt>
                <dd className="font-mono text-white">Key J</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Toggle village minimap</dt>
                <dd className="font-mono text-white">Key M</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Open room chat</dt>
                <dd className="font-mono text-white">Enter</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#A8B8AF]">Close dialogs</dt>
                <dd className="font-mono text-white">Esc</dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-[#9BB0A4]">
              Every clue, key, map fragment, and solved puzzle is shared across your whole group and saved automatically. Start by inspecting the Central Stone Well in Pixelfield Plaza!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
