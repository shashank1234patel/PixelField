import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowRight, Check, Sparkles, User } from 'lucide-react';
import { api } from '../lib/api.ts';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import type { UserProfile } from '../shared/protocol.ts';
import { AVATAR_COLORS, HAT_STYLES, type HatStyle } from '../shared/tiles.ts';

const HERO_IMAGE_URL = '/src/assets/images/village_hero_preview_1795195484200.jpg';

interface WelcomeScreenProps {
  pendingJoinCode: string | null;
  onAuthenticated: (user: UserProfile) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  pendingJoinCode,
  onAuthenticated,
}) => {
  const [guestName, setGuestName] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0].hex);
  const [hatStyle, setHatStyle] = useState<HatStyle>('straw');
  const [busy, setBusy] = useState<'google' | 'guest' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setBusy('google');
    try {
      await signInWithPopup(auth, googleAuthProvider);
      const { user } = await api.getMe();
      if (!user) {
        throw new Error('Could not complete Google sign-in. Please try again.');
      }
      onAuthenticated(user);
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Sign-in window was closed before finishing.'
          : err instanceof Error
          ? err.message
          : 'Google sign-in failed. Please try again or continue as a guest.';
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = guestName.trim();
    if (trimmed.length < 2) {
      setError('Please enter a display name of at least 2 characters.');
      return;
    }
    setError(null);
    setBusy('guest');
    try {
      const { user } = await api.enterAsGuest({
        displayName: trimmed,
        avatarColor,
        hatStyle,
      });
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enter as guest.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F5F0] text-[#1C2420] flex flex-col">
      {/* Clean 3-zone header */}
      <header className="w-full border-b border-[#E3E0D4] bg-[#F6F5F0]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <span className="font-display text-xl font-bold tracking-tight text-[#1C2420] whitespace-nowrap shrink-0">
            Pixelfield
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#525E57]">
            <a href="#features" className="hover:text-[#1C2420] transition-colors whitespace-nowrap shrink-0">
              Village Life
            </a>
            <a href="#guest-entry" className="hover:text-[#1C2420] transition-colors whitespace-nowrap shrink-0">
              Quick Guest Entry
            </a>
            <a href="#privacy" className="hover:text-[#1C2420] transition-colors whitespace-nowrap shrink-0">
              Privacy
            </a>
          </nav>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy !== null}
            className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#23553F] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {busy === 'google' ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-10 lg:py-14">
        {pendingJoinCode && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D4DFD8] bg-[#EDF4EF] px-5 py-3.5 text-sm text-[#1E3A2C]">
            <span>
              You were invited to join village <strong className="font-mono font-semibold">{pendingJoinCode}</strong>. Sign in or pick a guest name below to enter.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
          {/* Left column: Auth & Guest entry */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-8" id="guest-entry">
            <div>
              <p className="text-xs font-medium text-[#526058]">
                Browser multiplayer sandbox · 10–15 players per village · No download
              </p>
              <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight text-[#1C2420] sm:text-[2.75rem]">
                Build a shared pixel village with friends.
              </h1>
              <p className="mt-4 text-[15px] leading-relaxed text-[#4C5851]">
                Walk cobblestone lanes, plant gardens, place cottages and street lamps together in real time, and chat from any desktop or phone browser.
              </p>

              {/* Google Account Path */}
              <div className="mt-7">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#D2CFC2] bg-white px-4 py-3 text-sm font-semibold text-[#1C2420] shadow-xs hover:bg-[#FAF9F5] transition-colors disabled:opacity-60"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.29v-3.1H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.39l4-3.1Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l4 3.1c.94-2.84 3.59-4.95 6.71-4.95Z"
                    />
                  </svg>
                  <span>{busy === 'google' ? 'Connecting Google Account…' : 'Continue with Google Account'}</span>
                </button>
                <p className="mt-2 text-xs text-[#616E67]">
                  Keeps your villager profile, preferences, and owned worlds across devices.
                </p>
              </div>

              <div className="my-6 flex items-center gap-3 text-xs text-[#6E7A73]">
                <div className="h-px flex-1 bg-[#E1DDD0]" />
                <span>or enter as a guest</span>
                <div className="h-px flex-1 bg-[#E1DDD0]" />
              </div>

              {/* Guest Path */}
              <form onSubmit={handleGuestSubmit} className="space-y-4 rounded-xl border border-[#E1DDD0] bg-white p-5">
                <div>
                  <label htmlFor="guest-name" className="block text-sm font-medium text-[#1C2420]">
                    Villager display name
                  </label>
                  <div className="relative mt-1.5">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A857E]" />
                    <input
                      id="guest-name"
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      maxLength={24}
                      placeholder="e.g. Rowan, Mira, Sam"
                      className="w-full rounded-lg border border-[#D4D1C5] bg-[#FAFAF7] py-2.5 pl-9 pr-3 text-sm text-[#1C2420] placeholder:text-[#8E9992] focus:border-[#2D6A4F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <span className="block text-xs font-medium text-[#525E57]">Tunic color</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setAvatarColor(c.hex)}
                          title={c.label}
                          aria-label={`Select tunic color ${c.label}`}
                          className={`flex h-7 w-7 items-center justify-center rounded-md border transition-transform ${
                            avatarColor === c.hex
                              ? 'border-[#1C2420] scale-105 ring-2 ring-[#2D6A4F]/30'
                              : 'border-black/10 hover:scale-105'
                          }`}
                          style={{ backgroundColor: c.hex }}
                        >
                          {avatarColor === c.hex && <Check className="h-3.5 w-3.5 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs font-medium text-[#525E57]">Hat style</span>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {HAT_STYLES.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setHatStyle(h.id)}
                          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                            hatStyle === h.id
                              ? 'border-[#2D6A4F] bg-[#EDF4EF] text-[#1E4634]'
                              : 'border-[#E1DDD0] bg-[#FAFAF7] text-[#4C5851] hover:bg-[#F1EFE6]'
                          }`}
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="rounded-lg border border-[#E5B8B4] bg-[#FDF2F2] px-3 py-2 text-xs font-medium text-[#9B2C2C]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#23553F] transition-colors disabled:opacity-60"
                >
                  <span>{busy === 'guest' ? 'Entering Pixelfield…' : 'Enter as Guest'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <p className="text-xs leading-relaxed text-[#616E67]">
                  Guest progress is tied to this browser session until you link a Google account from your profile.
                </p>
              </form>
            </div>
          </div>

          {/* Right column: Full-height pixel-art village preview */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="relative flex-1 min-h-[300px] overflow-hidden rounded-xl border border-[#DDD9CA] bg-[#213328]">
              {!imgFailed ? (
                <img
                  src={HERO_IMAGE_URL}
                  alt="Sunlit top-down pixel-art preview of Pixelfield village with cobblestone paths, cottages, gardens, animal pasture, trees, lamps, and lakeside lantern tower"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover pixelated"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#2B593F] via-[#3F7A4D] to-[#28667A] p-8 text-center text-[#F6F5F0]">
                  <Sparkles className="h-10 w-10 text-[#F4D35E]" />
                  <p className="mt-3 font-display text-2xl font-semibold">Pixelfield Starter Village</p>
                  <p className="mt-1 text-sm text-white/80">Cobblestone square, timber cottages, gardens, pasture, and lakeside lantern</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#131C17]/90 via-[#131C17]/45 to-transparent p-6 text-[#F6F5F0]">
                <p className="font-display text-lg font-semibold">Pixelfield Starter Settlement</p>
                <p className="mt-1 text-xs text-[#D6DED8]">
                  Central stone well · Timber cottages · Fenced crop gardens & pasture · Lakeside dock & lantern tower
                </p>
              </div>
            </div>

            {/* Concise overview strip */}
            <div
              id="features"
              className="mt-6 grid grid-cols-1 gap-5 border-t border-[#E3E0D4] pt-5 sm:grid-cols-3"
            >
              <div>
                <h2 className="text-sm font-semibold text-[#1C2420]">Share a link or code</h2>
                <p className="mt-1 text-xs leading-relaxed text-[#525E57]">
                  Host private invite-only rooms, link-shared worlds, or open villages for 10 to 15 friends.
                </p>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#1C2420]">Build together live</h2>
                <p className="mt-1 text-xs leading-relaxed text-[#525E57]">
                  Lay cobblestone paths, timber walls, fences, lamps, and gardens saved persistently to PostgreSQL.
                </p>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#1C2420]">Seamless reconnect</h2>
                <p className="mt-1 text-xs leading-relaxed text-[#525E57]">
                  Refresh your browser or step away briefly and rejoin your exact villager seat without duplicates.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer id="privacy" className="border-t border-[#E3E0D4] py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 text-xs text-[#647069]">
          <span>Pixelfield Cooperative Village Sandbox</span>
          <span>Room chat is ephemeral in memory and not stored permanently · Delete your account anytime in Profile</span>
        </div>
      </footer>
    </div>
  );
};
