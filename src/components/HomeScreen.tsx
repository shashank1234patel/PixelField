import React, { useCallback, useEffect, useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  Check,
  Clock,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, saveReconnectCredential } from '../lib/api.ts';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type {
  BuildPolicy,
  RoomSummary,
  RoomVisibility,
  UserProfile,
} from '../shared/protocol.ts';
import { AVATAR_COLORS, HAT_STYLES, type HatStyle } from '../shared/tiles.ts';

const HERO_IMAGE_URL = '/src/assets/images/village_hero_preview_1795195484200.jpg';

interface HomeScreenProps {
  user: UserProfile;
  initialJoinCode: string | null;
  bannerMessage: string | null;
  onDismissBanner: () => void;
  onUserUpdated: (user: UserProfile) => void;
  onLoggedOut: () => void;
  onEnterRoom: (roomId: string) => void;
}

function extractRoomIdentifier(input: string): string {
  const trimmed = input.trim();
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const joinParam = url.searchParams.get('join');
      if (joinParam) return joinParam.trim();
      const parts = url.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last.trim();
    }
  } catch {
    // Not a URL, treat as raw code
  }
  return trimmed;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  user,
  initialJoinCode,
  bannerMessage,
  onDismissBanner,
  onUserUpdated,
  onLoggedOut,
  onEnterRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'home' | 'recent' | 'open'>('home');
  const [recentRooms, setRecentRooms] = useState<RoomSummary[]>([]);
  const [openRooms, setOpenRooms] = useState<RoomSummary[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [joinInput, setJoinInput] = useState(initialJoinCode ?? '');
  const [joinPassword, setJoinPassword] = useState('');
  const [needsPasswordFor, setNeedsPasswordFor] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Create room form state
  const [roomName, setRoomName] = useState(`${user.displayName}'s Village`);
  const [visibility, setVisibility] = useState<RoomVisibility>('open');
  const [capacity, setCapacity] = useState(15);
  const [allowLateJoin, setAllowLateJoin] = useState(true);
  const [buildPolicy, setBuildPolicy] = useState<BuildPolicy>('everyone');
  const [roomPassword, setRoomPassword] = useState('');
  const [mapSeed, setMapSeed] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Profile form state
  const [editName, setEditName] = useState(user.displayName);
  const [editColor, setEditColor] = useState(user.avatarColor);
  const [editHat, setEditHat] = useState<HatStyle>(user.hatStyle);
  const [editReducedMotion, setEditReducedMotion] = useState(user.reducedMotion);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadRooms = useCallback(async () => {
    setLoadingLists(true);
    try {
      const [recentRes, openRes] = await Promise.all([api.getRecentRooms(), api.getOpenRooms()]);
      setRecentRooms(recentRes.rooms);
      setOpenRooms(openRes.rooms);
    } catch {
      // Soft failure handled by empty state
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    setEditName(user.displayName);
    setEditColor(user.avatarColor);
    setEditHat(user.hatStyle);
    setEditReducedMotion(user.reducedMotion);
  }, [user]);

  const handleJoinIdentifier = async (identifierRaw: string, passwordOverride?: string) => {
    const identifier = extractRoomIdentifier(identifierRaw);
    if (!identifier) {
      setJoinError('Enter a 6-character room code or paste an invite link.');
      return;
    }
    setJoinError(null);
    setJoining(true);
    try {
      const res = await api.joinRoom({
        identifier,
        password: passwordOverride ?? (joinPassword || undefined),
      });
      saveReconnectCredential(res.room.id, res.reconnectToken);
      setNeedsPasswordFor(null);
      setJoinPassword('');
      onEnterRoom(res.room.id);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'PASSWORD_REQUIRED') {
        setNeedsPasswordFor(identifier);
        setJoinError('This village is password protected. Enter the room password to join.');
      } else {
        setJoinError(e.message || 'Could not join village.');
      }
    } finally {
      setJoining(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const parsedSeed = mapSeed.trim() ? Number(mapSeed.trim()) : undefined;
      const res = await api.createRoom({
        name: roomName.trim(),
        visibility,
        capacity,
        allowLateJoin,
        buildPolicy,
        password: roomPassword.trim() || undefined,
        seed: parsedSeed !== undefined && Number.isFinite(parsedSeed) ? parsedSeed : undefined,
      });
      saveReconnectCredential(res.room.id, res.reconnectToken);
      setShowCreateModal(false);
      onEnterRoom(res.room.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create village.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    try {
      await api.deleteRoom(roomId);
      setRecentRooms((prev) => prev.filter((r) => r.id !== roomId));
      setOpenRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch {
      // Ignore
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const res = await api.updatePreferences({
        displayName: editName,
        avatarColor: editColor,
        hatStyle: editHat,
        reducedMotion: editReducedMotion,
      });
      onUserUpdated(res.user);
      setProfileStatus('Preferences saved.');
    } catch (err) {
      setProfileStatus(err instanceof Error ? err.message : 'Could not save preferences.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    setProfileStatus(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
      await api.linkGuestToGoogle();
      const { user: fresh } = await api.getMe();
      if (fresh) onUserUpdated(fresh);
      setProfileStatus('Guest progress linked to your Google account.');
      void loadRooms();
    } catch (err) {
      setProfileStatus(err instanceof Error ? err.message : 'Could not link Google account.');
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
      if (auth.currentUser) {
        await signOut(auth);
      }
    } finally {
      onLoggedOut();
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await api.deleteAccount();
      if (auth.currentUser) {
        await signOut(auth);
      }
      onLoggedOut();
    } catch (err) {
      setProfileStatus(err instanceof Error ? err.message : 'Could not delete account.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F5F0] text-[#1C2420] flex flex-col">
      {/* Strict 3-zone Top Bar Contract */}
      <header className="sticky top-0 z-20 border-b border-[#E3E0D4] bg-[#F6F5F0]/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="font-display text-xl font-bold tracking-tight text-[#1C2420] whitespace-nowrap shrink-0"
          >
            Pixelfield
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#4F5C55]">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === 'home'
                  ? 'text-[#1C2420] border-b-2 border-[#2D6A4F]'
                  : 'hover:text-[#1C2420]'
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('recent');
                void loadRooms();
              }}
              className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === 'recent'
                  ? 'text-[#1C2420] border-b-2 border-[#2D6A4F]'
                  : 'hover:text-[#1C2420]'
              }`}
            >
              Recent Worlds
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('open');
                void loadRooms();
              }}
              className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === 'open'
                  ? 'text-[#1C2420] border-b-2 border-[#2D6A4F]'
                  : 'hover:text-[#1C2420]'
              }`}
            >
              Open Rooms
            </button>
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="hover:text-[#1C2420] transition-colors whitespace-nowrap shrink-0 pb-0.5"
            >
              Controls
            </button>
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="hover:text-[#1C2420] transition-colors whitespace-nowrap shrink-0 pb-0.5"
            >
              Profile
            </button>
          </nav>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#23553F] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Create World</span>
          </button>
        </div>

        {/* Mobile navigation row */}
        <div className="flex md:hidden items-center gap-5 border-t border-[#E3E0D4] px-6 py-2.5 text-xs font-medium text-[#4F5C55] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className={`whitespace-nowrap shrink-0 ${activeTab === 'home' ? 'text-[#1C2420] font-semibold' : ''}`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('recent');
              void loadRooms();
            }}
            className={`whitespace-nowrap shrink-0 ${activeTab === 'recent' ? 'text-[#1C2420] font-semibold' : ''}`}
          >
            Recent Worlds
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('open');
              void loadRooms();
            }}
            className={`whitespace-nowrap shrink-0 ${activeTab === 'open' ? 'text-[#1C2420] font-semibold' : ''}`}
          >
            Open Rooms
          </button>
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="whitespace-nowrap shrink-0"
          >
            Profile
          </button>
        </div>
      </header>

      <main
        id="top"
        className={`mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 lg:py-10 space-y-8 ${
          activeTab === 'home' ? 'justify-center' : 'justify-start'
        }`}
      >
        {bannerMessage && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[#E2CFA8] bg-[#FDF8EC] px-4 py-3 text-sm text-[#6B4E16]">
            <span>{bannerMessage}</span>
            <button
              type="button"
              onClick={onDismissBanner}
              aria-label="Dismiss message"
              className="text-[#8B6A2B] hover:text-[#4D370C]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Home View */}
        {activeTab === 'home' && (
        <section className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between gap-6">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-[#1C2420] sm:text-4xl">
                Join or create a village.
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-[#2D6A4F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#23553F] transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create World</span>
                </button>
              </div>
            </div>

            {/* Join with Code Card */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleJoinIdentifier(joinInput);
              }}
              className="rounded-xl border border-[#E1DDD0] bg-white p-5 space-y-3"
            >
              <label htmlFor="join-code-input" className="block text-sm font-semibold text-[#1C2420]">
                Join with room code or invite link
              </label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  id="join-code-input"
                  type="text"
                  value={joinInput}
                  onChange={(e) => {
                    setJoinInput(e.target.value);
                    setJoinError(null);
                  }}
                  placeholder="Enter 6-letter code (e.g. WLB4K9) or paste link"
                  className="flex-1 rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] px-3.5 py-2.5 text-sm font-mono text-[#1C2420] placeholder:font-sans placeholder:text-[#8E9992] focus:border-[#2D6A4F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20"
                />
                <button
                  type="submit"
                  disabled={joining}
                  className="rounded-lg bg-[#1C2420] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2E3A34] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  {joining ? 'Joining…' : 'Join Village'}
                </button>
              </div>

              {needsPasswordFor && (
                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                  <div className="relative flex-1">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A857E]" />
                    <input
                      type="password"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      placeholder="Enter room password"
                      autoFocus
                      className="w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] py-2 pl-9 pr-3 text-sm text-[#1C2420] focus:border-[#2D6A4F] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleJoinIdentifier(needsPasswordFor, joinPassword)}
                    disabled={joining}
                    className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#23553F] whitespace-nowrap shrink-0"
                  >
                    Unlock & Join
                  </button>
                </div>
              )}

              {joinError && (
                <p role="alert" className="text-xs font-medium text-[#9B2C2C]">
                  {joinError}
                </p>
              )}
            </form>
          </div>

          {/* Right column: Clean village image */}
          <div className="lg:col-span-6">
            <div className="h-full min-h-[240px] overflow-hidden rounded-xl border border-[#DDD9CA] bg-[#213328]">
              <img
                src={HERO_IMAGE_URL}
                alt="Pixelfield village"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover pixelated"
              />
            </div>
          </div>
        </section>
        )}

        {/* Dedicated Recent Worlds View */}
        {activeTab === 'recent' && (
        <section id="recent" className="w-full flex-1 space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-[#E3E0D4] pb-3">
            <h2 className="font-display text-2xl font-semibold text-[#1C2420]">Recent Worlds</h2>
            <button
              type="button"
              onClick={() => void loadRooms()}
              className="flex items-center gap-1.5 text-xs font-medium text-[#4C5851] hover:text-[#1C2420] whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingLists ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {loadingLists ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-28 rounded-xl border border-[#E3E0D4] bg-white/60 animate-pulse" />
              ))}
            </div>
          ) : recentRooms.length === 0 ? (
            <div className="rounded-xl border border-[#E3E0D4] bg-white px-6 py-6 text-sm text-[#5A6660]">
              No recent worlds yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {recentRooms.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col justify-between rounded-xl border border-[#E1DDD0] bg-white p-5 transition-colors hover:border-[#C5C0B0]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-[#1C2420] truncate">{r.name}</h3>
                      {r.ownerUid === user.uid && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteRoom(r.id)}
                          title="Delete village permanently"
                          aria-label={`Delete ${r.name}`}
                          className="text-[#8E9992] hover:text-[#9B2C2C] transition-colors shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[#5A6660] tabular-nums">
                      <span className="font-mono font-medium text-[#2E3A34]">{r.shortCode}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {r.onlineCount}/{r.capacity} online
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{r.status === 'active' ? 'Live World' : 'In Lobby'}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-xs text-[#737F78]">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(r.lastActiveAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleJoinIdentifier(r.id)}
                      className="rounded-lg bg-[#EDF4EF] px-3.5 py-1.5 text-xs font-semibold text-[#1E4634] hover:bg-[#DCEBE1] transition-colors whitespace-nowrap"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {/* Dedicated Open Rooms View */}
        {activeTab === 'open' && (
        <section id="open-rooms" className="w-full flex-1 space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-[#E3E0D4] pb-3">
            <h2 className="font-display text-2xl font-semibold text-[#1C2420]">Open Rooms</h2>
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-[#5A6660] tabular-nums">
                {openRooms.length} open
              </span>
              <button
                type="button"
                onClick={() => void loadRooms()}
                className="flex items-center gap-1.5 text-xs font-medium text-[#4C5851] hover:text-[#1C2420] whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingLists ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {needsPasswordFor && (
            <div className="flex flex-col gap-2 rounded-xl border border-[#E1DDD0] bg-white p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A857E]" />
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Enter room password"
                  autoFocus
                  className="w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] py-2 pl-9 pr-3 text-sm text-[#1C2420] focus:border-[#2D6A4F] focus:bg-white focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleJoinIdentifier(needsPasswordFor, joinPassword)}
                disabled={joining}
                className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#23553F] whitespace-nowrap shrink-0"
              >
                Unlock & Join
              </button>
            </div>
          )}

          {joinError && (
            <p role="alert" className="text-xs font-medium text-[#9B2C2C]">
              {joinError}
            </p>
          )}

          {openRooms.length === 0 ? (
            <div className="rounded-xl border border-[#E3E0D4] bg-white px-6 py-6 text-sm text-[#5A6660]">
              No open rooms right now.
            </div>
          ) : (
            <div className="divide-y divide-[#E8E5DA] overflow-hidden rounded-xl border border-[#E1DDD0] bg-white">
              {openRooms.map((r) => {
                const isFull = r.onlineCount >= r.capacity;
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-[#FAFAF6] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[#1C2420] truncate">{r.name}</h3>
                        {r.hasPassword && <Lock className="h-3.5 w-3.5 text-[#7A857E] shrink-0" />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5A6660] tabular-nums">
                        <span>Host: {r.ownerName || 'Villager'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{r.shortCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{r.status === 'active' ? 'Open World' : 'Lobby Waiting'}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {r.buildPolicy === 'everyone'
                            ? 'Open Building'
                            : r.buildPolicy === 'build_zones'
                            ? 'Build Zones'
                            : 'Host Builds'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[#2E3A34] tabular-nums">
                        <Users className="h-4 w-4 text-[#6B7770]" />
                        {r.onlineCount}/{r.capacity}
                      </span>
                      <button
                        type="button"
                        disabled={isFull || joining}
                        onClick={() => void handleJoinIdentifier(r.id)}
                        className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#23553F] transition-colors disabled:bg-[#C8CEC9] disabled:text-[#5F6B64] whitespace-nowrap"
                      >
                        {isFull ? 'Room Full' : 'Join'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        )}
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
            className="w-full max-w-lg rounded-xl border border-[#DDD9CA] bg-white p-6 shadow-xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#ECE9DF] pb-4">
              <div>
                <h2 id="create-room-title" className="font-display text-2xl font-semibold text-[#1C2420]">
                  Create a Village World
                </h2>
                <p className="text-xs text-[#5A6660]">Pixelfield Village Map · 192 × 144 tiles</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close create modal"
                className="rounded-md p-1.5 text-[#5A6660] hover:bg-[#F2F0E8]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="mt-5 space-y-5">
              <div>
                <label htmlFor="create-name" className="block text-sm font-medium text-[#1C2420]">
                  Village name
                </label>
                <input
                  id="create-name"
                  type="text"
                  required
                  maxLength={42}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] px-3.5 py-2 text-sm text-[#1C2420] focus:border-[#2D6A4F] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-sm font-medium text-[#1C2420]">Access & Discovery</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'code', label: 'Code Only', desc: 'Private short code' },
                      { id: 'link', label: 'Invite Link', desc: 'Friends with link' },
                      { id: 'open', label: 'Open List', desc: 'Public discovery' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVisibility(opt.id)}
                      className={`rounded-lg border p-2.5 text-left transition-colors ${
                        visibility === opt.id
                          ? 'border-[#2D6A4F] bg-[#EDF4EF] text-[#1B4332]'
                          : 'border-[#E1DDD0] bg-[#FAFAF7] text-[#3B4640] hover:bg-[#F2F0E8]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        {opt.id === 'open' ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        <span>{opt.label}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] opacity-80">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="create-cap" className="flex items-center justify-between text-sm font-medium text-[#1C2420]">
                    <span>Maximum players</span>
                    <span className="font-mono text-sm font-semibold text-[#2D6A4F] tabular-nums">{capacity}</span>
                  </label>
                  <input
                    id="create-cap"
                    type="range"
                    min={10}
                    max={15}
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="mt-2 w-full accent-[#2D6A4F]"
                  />
                  <div className="flex justify-between text-[11px] text-[#6B7770] tabular-nums">
                    <span>10</span>
                    <span>12</span>
                    <span>15</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="create-policy" className="block text-sm font-medium text-[#1C2420]">
                    Building permissions
                  </label>
                  <select
                    id="create-policy"
                    value={buildPolicy}
                    onChange={(e) => setBuildPolicy(e.target.value as BuildPolicy)}
                    className="mt-1.5 w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] px-3 py-2 text-sm text-[#1C2420] focus:border-[#2D6A4F] focus:outline-none"
                  >
                    <option value="everyone">Everyone can build</option>
                    <option value="build_zones">Marked build zones only</option>
                    <option value="host_only">Host only</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="create-pw" className="block text-sm font-medium text-[#1C2420]">
                    Optional password
                  </label>
                  <input
                    id="create-pw"
                    type="password"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    placeholder="No password"
                    className="mt-1.5 w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] px-3.5 py-2 text-sm text-[#1C2420] placeholder:text-[#8E9992] focus:border-[#2D6A4F] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="create-seed" className="block text-sm font-medium text-[#1C2420]">
                    Map seed (optional)
                  </label>
                  <input
                    id="create-seed"
                    type="number"
                    min={1}
                    max={999999999}
                    value={mapSeed}
                    onChange={(e) => setMapSeed(e.target.value)}
                    placeholder="Random village"
                    className="mt-1.5 w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] px-3.5 py-2 text-sm font-mono text-[#1C2420] placeholder:font-sans placeholder:text-[#8E9992] focus:border-[#2D6A4F] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-sm text-[#3B4640] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowLateJoin}
                  onChange={(e) => setAllowLateJoin(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-[#2D6A4F]"
                />
                <span>Allow friends to join after the village has started (up to {capacity} players)</span>
              </label>

              {createError && (
                <p role="alert" className="text-xs font-medium text-[#9B2C2C]">
                  {createError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-[#ECE9DF] pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-[#D4D1C5] px-4 py-2 text-sm font-medium text-[#3B4640] hover:bg-[#F5F3EC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-[#2D6A4F] px-5 py-2 text-sm font-semibold text-white hover:bg-[#23553F] disabled:opacity-60"
                >
                  {creating ? 'Creating…' : 'Open Lobby'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile & Account Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
            className="w-full max-w-md rounded-xl border border-[#DDD9CA] bg-white p-6 shadow-xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#ECE9DF] pb-4">
              <h2 id="profile-modal-title" className="font-display text-2xl font-semibold text-[#1C2420]">
                Profile
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  setConfirmDelete(false);
                }}
                aria-label="Close profile modal"
                className="rounded-md p-1.5 text-[#5A6660] hover:bg-[#F2F0E8]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#ECE9DF] bg-[#FAFAF7] p-3.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 text-xs font-bold text-white"
                style={{ backgroundColor: user.avatarColor }}
              >
                {user.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[#1C2420] truncate">{user.displayName}</p>
                <p className="text-xs text-[#5A6660] truncate">
                  {user.authType === 'google' ? user.email : 'Guest session'}
                </p>
              </div>
            </div>

            {user.authType === 'guest' && (
              <div className="mt-4 rounded-lg border border-[#D4DFD8] bg-[#EDF4EF] p-4 space-y-2.5">
                <p className="text-xs leading-relaxed text-[#1E3A2C]">
                  Link your guest session to a Google Account to keep your worlds and avatar preferences across devices.
                </p>
                <button
                  type="button"
                  onClick={handleLinkGoogle}
                  disabled={linkingGoogle}
                  className="w-full rounded-lg bg-[#2D6A4F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#23553F] disabled:opacity-60"
                >
                  {linkingGoogle ? 'Linking Google Account…' : 'Link Guest Progress to Google'}
                </button>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <div>
                <label htmlFor="pref-name" className="block text-sm font-medium text-[#1C2420]">
                  Display name
                </label>
                <input
                  id="pref-name"
                  type="text"
                  maxLength={24}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] px-3.5 py-2 text-sm text-[#1C2420] focus:border-[#2D6A4F] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-sm font-medium text-[#1C2420]">Tunic color</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditColor(c.hex)}
                      aria-label={c.label}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                        editColor === c.hex ? 'border-[#1C2420] ring-2 ring-[#2D6A4F]/30' : 'border-black/10'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      {editColor === c.hex && <Check className="h-4 w-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-[#1C2420]">Hat style</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {HAT_STYLES.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setEditHat(h.id)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        editHat === h.id
                          ? 'border-[#2D6A4F] bg-[#EDF4EF] text-[#1B4332]'
                          : 'border-[#E1DDD0] bg-[#FAFAF7] text-[#3B4640]'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-[#3B4640] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editReducedMotion}
                  onChange={(e) => setEditReducedMotion(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#2D6A4F]"
                />
                <span>Reduced motion & low visual effects</span>
              </label>

              {profileStatus && <p className="text-xs font-medium text-[#2D6A4F]">{profileStatus}</p>}

              <button
                type="submit"
                disabled={savingProfile}
                className="w-full rounded-lg bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#23553F] disabled:opacity-60"
              >
                {savingProfile ? 'Saving…' : 'Save Preferences'}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between border-t border-[#ECE9DF] pt-4">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-xs font-medium text-[#4C5851] hover:text-[#1C2420]"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign out</span>
              </button>

              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs font-medium text-[#9B2C2C] hover:underline"
                >
                  Delete account
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="rounded-md bg-[#9B2C2C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#7D2222]"
                >
                  Confirm Delete Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Controls Quick Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#DDD9CA] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#ECE9DF] pb-3">
              <h2 className="font-display text-xl font-semibold text-[#1C2420]">Village Controls</h2>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="rounded-md p-1 text-[#5A6660] hover:bg-[#F2F0E8]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#5A6660]">Move around</dt>
                <dd className="font-mono text-xs font-semibold text-[#1C2420]">WASD / Arrow keys / Touch pad</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#5A6660]">Place selected tile</dt>
                <dd className="font-mono text-xs font-semibold text-[#1C2420]">Left-click or Space</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#5A6660]">Clear / Remove tile</dt>
                <dd className="font-mono text-xs font-semibold text-[#1C2420]">Right-click or Clear mode (B)</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#5A6660]">Quick-pick hotbar slot</dt>
                <dd className="font-mono text-xs font-semibold text-[#1C2420]">Keys 1 – 9</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#5A6660]">Undo last placement</dt>
                <dd className="font-mono text-xs font-semibold text-[#1C2420]">Key Z</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
};
