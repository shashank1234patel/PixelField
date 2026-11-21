import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { HomeScreen } from './components/HomeScreen.tsx';
import { LobbyScreen } from './components/LobbyScreen.tsx';
import { WelcomeScreen } from './components/WelcomeScreen.tsx';
import { WorldScreen } from './components/WorldScreen.tsx';
import { useRoomSocket } from './hooks/useRoomSocket.ts';
import {
  api,
  clearReconnectCredential,
  getLastRoomId,
  getReconnectCredential,
  saveReconnectCredential,
} from './lib/api.ts';
import { auth } from './lib/firebase.ts';
import type { UserProfile } from './shared/protocol.ts';

function readInviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const q = params.get('join');
  if (q && q.trim().length > 0) return q.trim().toUpperCase();
  const match = window.location.pathname.match(/^\/room\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

interface ActiveRoomContainerProps {
  roomId: string;
  user: UserProfile;
  onExitRoom: (reason?: string) => void;
}

const ActiveRoomContainer: React.FC<ActiveRoomContainerProps> = ({
  roomId,
  user,
  onExitRoom,
}) => {
  const handleFatalLeave = useCallback(
    (reason: string) => {
      onExitRoom(reason);
    },
    [onExitRoom]
  );

  const socket = useRoomSocket(roomId, handleFatalLeave);

  const handleManualLeave = () => {
    socket.leaveRoom();
    onExitRoom();
  };

  if (!socket.room || !socket.selfUid) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#141C19] px-6 text-center text-[#F4F3EE]">
        <p className="font-display text-2xl font-semibold">Entering Pixelfield…</p>
        <p className="mt-2 text-xs text-[#9BB0A4]">
          {socket.connectionState === 'reconnecting'
            ? 'Restoring your villager seat and syncing village tiles…'
            : 'Loading shared village state…'}
        </p>
        <button
          type="button"
          onClick={handleManualLeave}
          className="mt-6 rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-[#D4DFD8] hover:bg-white/10"
        >
          Return to Home
        </button>
      </div>
    );
  }

  if (socket.room.status === 'lobby') {
    return (
      <LobbyScreen
        room={socket.room}
        selfUid={socket.selfUid}
        players={socket.players}
        connectionState={socket.connectionState}
        onSetReady={socket.setReady}
        onStartRoom={socket.startRoom}
        onCloseRoom={socket.closeRoom}
        onUpdateSettings={socket.updateSettings}
        onKickPlayer={socket.kickPlayer}
        onTransferHost={socket.transferHost}
        onLeave={handleManualLeave}
      />
    );
  }

  return (
    <WorldScreen
      room={socket.room}
      selfUid={socket.selfUid}
      players={socket.players}
      chatMessages={socket.chatMessages}
      connectionState={socket.connectionState}
      canUndo={socket.canUndo}
      worldVersion={socket.worldVersion}
      toast={socket.toast}
      reducedMotion={user.reducedMotion}
      mapRef={socket.mapRef}
      playersRef={socket.playersRef}
      onSendMove={socket.sendMove}
      onRequestEdit={socket.requestEdit}
      onRequestUndo={socket.requestUndo}
      onSendChat={socket.sendChat}
      onReportPlayer={socket.reportPlayer}
      onUpdateSettings={socket.updateSettings}
      onKickPlayer={socket.kickPlayer}
      onTransferHost={socket.transferHost}
      onCloseRoom={socket.closeRoom}
      onLeave={handleManualLeave}
    />
  );
};

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(() => readInviteCodeFromUrl());
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const attemptInviteOrReconnect = useCallback(async (loggedInUser: UserProfile) => {
    const inviteCode = readInviteCodeFromUrl();
    if (inviteCode) {
      try {
        const res = await api.joinRoom({ identifier: inviteCode });
        saveReconnectCredential(res.room.id, res.reconnectToken);
        window.history.replaceState({}, '', '/');
        setPendingJoinCode(null);
        setActiveRoomId(res.room.id);
        return;
      } catch (err) {
        const e = err as Error & { code?: string };
        setPendingJoinCode(inviteCode);
        if (e.code === 'PASSWORD_REQUIRED') {
          setBannerMessage(`Village ${inviteCode} requires a password. Enter it below to join.`);
        } else {
          setBannerMessage(e.message || `Could not auto-join village ${inviteCode}.`);
        }
        return;
      }
    }

    // Attempt seamless seat restoration after refresh if a valid short-lived reconnect credential exists
    const lastRoomId = getLastRoomId();
    if (lastRoomId) {
      const token = getReconnectCredential(lastRoomId);
      if (token && loggedInUser) {
        try {
          const res = await api.joinRoom({ identifier: lastRoomId, reconnectToken: token });
          saveReconnectCredential(res.room.id, res.reconnectToken);
          setActiveRoomId(res.room.id);
        } catch {
          clearReconnectCredential(lastRoomId);
        }
      }
    }
  }, []);

  useEffect(() => {
    let resolvedOnce = false;
    const unsub = onAuthStateChanged(auth, async () => {
      try {
        const { user: fetched } = await api.getMe();
        setUser(fetched);
        if (fetched && !resolvedOnce) {
          resolvedOnce = true;
          await attemptInviteOrReconnect(fetched);
        }
      } catch {
        setUser(null);
      } finally {
        setInitializing(false);
      }
    });
    return () => unsub();
  }, [attemptInviteOrReconnect]);

  const handleAuthenticated = async (authedUser: UserProfile) => {
    setUser(authedUser);
    await attemptInviteOrReconnect(authedUser);
  };

  const handleExitRoom = useCallback((reason?: string) => {
    setActiveRoomId(null);
    if (reason) {
      setBannerMessage(reason);
    }
  }, []);

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F5F0] text-[#1C2420]">
        <div className="text-center">
          <p className="font-display text-2xl font-semibold">Pixelfield</p>
          <p className="mt-1.5 text-xs text-[#5A6660]">Preparing your village…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <WelcomeScreen
        pendingJoinCode={pendingJoinCode}
        onAuthenticated={(u) => void handleAuthenticated(u)}
      />
    );
  }

  if (activeRoomId) {
    return (
      <ActiveRoomContainer
        roomId={activeRoomId}
        user={user}
        onExitRoom={handleExitRoom}
      />
    );
  }

  return (
    <HomeScreen
      user={user}
      initialJoinCode={pendingJoinCode}
      bannerMessage={bannerMessage}
      onDismissBanner={() => setBannerMessage(null)}
      onUserUpdated={setUser}
      onLoggedOut={() => {
        setUser(null);
        setActiveRoomId(null);
      }}
      onEnterRoom={(id) => {
        setBannerMessage(null);
        setPendingJoinCode(null);
        setActiveRoomId(id);
      }}
    />
  );
}
