import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Link2,
  Play,
  ShieldAlert,
  UserMinus,
  Users,
} from 'lucide-react';
import type { ConnectionState } from '../hooks/useRoomSocket.ts';
import type {
  BuildPolicy,
  RoomPlayerState,
  RoomSummary,
  RoomVisibility,
} from '../shared/protocol.ts';

interface LobbyScreenProps {
  room: RoomSummary;
  selfUid: string;
  players: RoomPlayerState[];
  connectionState: ConnectionState;
  onSetReady: (ready: boolean) => void;
  onStartRoom: () => void;
  onCloseRoom: () => void;
  onUpdateSettings: (settings: {
    name?: string;
    visibility?: RoomVisibility;
    capacity?: number;
    allowLateJoin?: boolean;
    buildPolicy?: BuildPolicy;
  }) => void;
  onKickPlayer: (targetUid: string, ban?: boolean) => void;
  onTransferHost: (targetUid: string) => void;
  onLeave: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  selfUid,
  players,
  connectionState,
  onSetReady,
  onStartRoom,
  onCloseRoom,
  onUpdateSettings,
  onKickPlayer,
  onTransferHost,
  onLeave,
}) => {
  const self = players.find((p) => p.uid === selfUid);
  const isHost = self?.role === 'host' || room.ownerUid === selfUid;

  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const inviteUrl = `${window.location.origin}/?join=${encodeURIComponent(room.shortCode)}`;

  const copyText = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // Fallback ignored silently
    }
  };

  const connectedCount = players.filter((p) => p.connected).length;

  return (
    <div className="min-h-screen bg-[#F6F5F0] text-[#1C2420] flex flex-col">
      {/* Clean 3-zone header */}
      <header className="border-b border-[#E3E0D4] bg-[#F6F5F0]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-8 px-6 py-4">
          <button
            type="button"
            onClick={onLeave}
            className="flex items-center gap-2 text-sm font-medium text-[#4C5851] hover:text-[#1C2420] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Home</span>
          </button>

          <div className="hidden sm:flex items-center gap-2 text-xs text-[#525E57] tabular-nums">
            <span
              className={`h-2 w-2 rounded-full ${
                connectionState === 'connected' ? 'bg-[#2D6A4F]' : 'bg-[#C87D28]'
              }`}
            />
            <span>
              {connectionState === 'connected'
                ? 'Connected to lobby'
                : connectionState === 'reconnecting'
                ? 'Reconnecting…'
                : 'Connecting…'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {connectedCount}/{room.capacity} players
            </span>
          </div>

          {isHost ? (
            <button
              type="button"
              onClick={onStartRoom}
              className="flex items-center gap-1.5 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#23553F] transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4" />
              <span>Start Village</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSetReady(!self?.ready)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                self?.ready
                  ? 'border border-[#2D6A4F] bg-[#EDF4EF] text-[#1B4332]'
                  : 'bg-[#2D6A4F] text-white hover:bg-[#23553F]'
              }`}
            >
              {self?.ready ? 'Ready' : 'Mark Ready'}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 space-y-8">
        {/* Room identity & Shareable Invite Strip */}
        <section className="flex flex-wrap items-end justify-between gap-6 border-b border-[#E3E0D4] pb-6">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[#1C2420]">
              {room.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void copyText(room.shortCode, 'code')}
              className="flex items-center gap-2.5 rounded-lg border border-[#D4D1C5] bg-white px-4 py-2.5 text-sm font-mono font-semibold text-[#1C2420] hover:bg-[#FAF9F5] transition-colors"
            >
              <span>{room.shortCode}</span>
              {copiedType === 'code' ? (
                <Check className="h-4 w-4 text-[#2D6A4F]" />
              ) : (
                <Copy className="h-4 w-4 text-[#6B7770]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void copyText(inviteUrl, 'link')}
              className="flex items-center gap-2 rounded-lg border border-[#D4D1C5] bg-white px-4 py-2.5 text-sm font-medium text-[#1C2420] hover:bg-[#FAF9F5] transition-colors whitespace-nowrap"
            >
              {copiedType === 'link' ? (
                <>
                  <Check className="h-4 w-4 text-[#2D6A4F]" />
                  <span>Invite Link Copied</span>
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 text-[#525E57]" />
                  <span>Copy Invite Link</span>
                </>
              )}
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left: Roster */}
          <section className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-[#1C2420]">Villagers</h2>
              <span className="flex items-center gap-1.5 text-xs font-medium text-[#5A6660] tabular-nums">
                <Users className="h-3.5 w-3.5" />
                {connectedCount} / {room.capacity} seated
              </span>
            </div>

            <div className="divide-y divide-[#ECE9DF] overflow-hidden rounded-xl border border-[#E1DDD0] bg-white">
              {players.map((p) => {
                const isMe = p.uid === selfUid;
                return (
                  <div key={p.uid} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 text-xs font-bold text-white"
                        style={{ backgroundColor: p.avatarColor }}
                      >
                        {p.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-[#1C2420] truncate">
                            {p.displayName}
                          </span>
                          {isMe && <span className="text-xs text-[#6B7770]">(You)</span>}
                          {p.role === 'host' && (
                            <Crown className="h-3.5 w-3.5 text-[#C87D28] shrink-0" aria-label="Host" />
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#5A6660]">
                          <span>{p.role === 'host' ? 'Host' : 'Player'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{!p.connected ? 'Reconnecting…' : p.ready ? 'Ready' : 'Getting ready'}</span>
                        </div>
                      </div>
                    </div>

                    {isHost && !isMe && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onTransferHost(p.uid)}
                          title="Transfer host role"
                          className="rounded-md border border-[#E1DDD0] px-2.5 py-1 text-xs font-medium text-[#3B4640] hover:bg-[#F5F3EC]"
                        >
                          Make Host
                        </button>
                        <button
                          type="button"
                          onClick={() => onKickPlayer(p.uid, false)}
                          title="Remove from lobby"
                          aria-label={`Remove ${p.displayName}`}
                          className="rounded-md border border-[#E1DDD0] p-1.5 text-[#6B7770] hover:border-[#E5B8B4] hover:text-[#9B2C2C]"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right: Readable & Editable Settings */}
          <section className="lg:col-span-5 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#1C2420]">Room Settings</h2>

            <div className="rounded-xl border border-[#E1DDD0] bg-white p-5 space-y-4">
              <div>
                <label htmlFor="lobby-vis" className="block text-xs font-medium text-[#5A6660]">
                  Access & Visibility
                </label>
                {isHost ? (
                  <select
                    id="lobby-vis"
                    value={room.visibility}
                    onChange={(e) => onUpdateSettings({ visibility: e.target.value as RoomVisibility })}
                    className="mt-1.5 w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] px-3 py-2 text-sm text-[#1C2420]"
                  >
                    <option value="code">Code Only (Private)</option>
                    <option value="link">Friends with Invite Link</option>
                    <option value="open">Open Discovery</option>
                  </select>
                ) : (
                  <p className="mt-1 text-sm font-medium text-[#1C2420]">
                    {room.visibility === 'open'
                      ? 'Open Discovery'
                      : room.visibility === 'link'
                      ? 'Friends with Invite Link'
                      : 'Code Only'}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="lobby-cap" className="flex items-center justify-between text-xs font-medium text-[#5A6660]">
                  <span>Player Capacity (10–15)</span>
                  <span className="font-mono text-sm font-semibold text-[#1C2420] tabular-nums">{room.capacity}</span>
                </label>
                {isHost ? (
                  <input
                    id="lobby-cap"
                    type="range"
                    min={10}
                    max={15}
                    value={room.capacity}
                    onChange={(e) => onUpdateSettings({ capacity: Number(e.target.value) })}
                    className="mt-2 w-full accent-[#2D6A4F]"
                  />
                ) : (
                  <p className="mt-1 text-sm font-medium text-[#1C2420] tabular-nums">Up to {room.capacity} players</p>
                )}
              </div>

              <div>
                <label htmlFor="lobby-policy" className="block text-xs font-medium text-[#5A6660]">
                  Building Policy
                </label>
                {isHost ? (
                  <select
                    id="lobby-policy"
                    value={room.buildPolicy}
                    onChange={(e) => onUpdateSettings({ buildPolicy: e.target.value as BuildPolicy })}
                    className="mt-1.5 w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] px-3 py-2 text-sm text-[#1C2420]"
                  >
                    <option value="everyone">Everyone can build</option>
                    <option value="build_zones">Marked build zones only</option>
                    <option value="host_only">Host only</option>
                  </select>
                ) : (
                  <p className="mt-1 text-sm font-medium text-[#1C2420]">
                    {room.buildPolicy === 'everyone'
                      ? 'Everyone can build'
                      : room.buildPolicy === 'build_zones'
                      ? 'Marked build zones only'
                      : 'Host only'}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-sm text-[#3B4640]">Allow late arrivals</span>
                {isHost ? (
                  <input
                    type="checkbox"
                    checked={room.allowLateJoin}
                    onChange={(e) => onUpdateSettings({ allowLateJoin: e.target.checked })}
                    className="h-4 w-4 accent-[#2D6A4F]"
                  />
                ) : (
                  <span className="text-sm font-medium text-[#1C2420]">
                    {room.allowLateJoin ? 'Allowed' : 'Locked on start'}
                  </span>
                )}
              </div>

              <div className="border-t border-[#ECE9DF] pt-4 text-xs text-[#616E67]">
                World Map: <strong className="font-medium text-[#1C2420]">Pixelfield Village · 192 × 144</strong>
              </div>

              {isHost && (
                <div className="border-t border-[#ECE9DF] pt-4 space-y-2.5">
                  <button
                    type="button"
                    onClick={onStartRoom}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#23553F]"
                  >
                    <Play className="h-4 w-4" />
                    <span>Enter Village Together</span>
                  </button>

                  {!confirmClose ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClose(true)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E5D3D1] px-4 py-2 text-xs font-medium text-[#9B2C2C] hover:bg-[#FDF2F2]"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Close Room</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onCloseRoom}
                      className="w-full rounded-lg bg-[#9B2C2C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7D2222]"
                    >
                      Confirm Close Room for Everyone
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
