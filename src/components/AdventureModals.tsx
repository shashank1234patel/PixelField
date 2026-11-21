import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  HelpCircle,
  KeyRound,
  Lightbulb,
  Lock,
  Map as MapIcon,
  RotateCcw,
  ScrollText,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import type { PuzzleFeedbackState } from '../hooks/useRoomSocket.ts';
import {
  ADVENTURE_CLUES,
  ADVENTURE_ITEMS,
  ADVENTURE_QUESTS,
  type AdventureNodeDef,
  type AdventureState,
  EMBLEM_OPTIONS,
  type EmblemSymbolId,
  getActiveQuest,
  getStoryProgressMetrics,
} from '../shared/adventureData.ts';

interface NodeInspectionModalProps {
  node: AdventureNodeDef;
  adventure: AdventureState;
  onUnlockVaultChest: () => void;
  onOpenJournal: () => void;
  onClose: () => void;
}

export const NodeInspectionModal: React.FC<NodeInspectionModalProps> = ({
  node,
  adventure,
  onUnlockVaultChest,
  onOpenJournal,
  onClose,
}) => {
  const clue = node.clueId ? ADVENTURE_CLUES[node.clueId] : null;
  const clueDiscovered = clue ? adventure.discoveredClues.includes(clue.id) : false;
  const item = node.itemId ? ADVENTURE_ITEMS[node.itemId] : null;
  const itemCollected = item ? adventure.collectedItems.includes(item.id) : false;

  const isClara = node.id === 'npc_clara';
  const satchelsCollected = ['herb_satchel_1', 'herb_satchel_2', 'herb_satchel_3'].filter((id) =>
    adventure.collectedItems.includes(id)
  ).length;
  const claraDone = adventure.completedQuests.includes('q2_clara_satchels');

  const isVaultChest = node.id === 'founders_vault_chest';
  const vaultOpened = adventure.openedChests.includes('founders_vault_chest');
  const hasCopperKey = adventure.collectedItems.includes('copper_field_key');
  const hasSilverCrest = adventure.collectedItems.includes('silver_vault_crest');
  const canOpenVault = hasCopperKey && hasSilverCrest && !vaultOpened;

  const isDoor = node.id === 'hidden_cavern_door';
  const isPlate = node.kind === 'pressure_plate';

  let narrativeText = node.inspectionText;
  if (isClara && claraDone && node.afterText) {
    narrativeText = node.afterText;
  } else if (isVaultChest && vaultOpened && node.afterText) {
    narrativeText = node.afterText;
  } else if (isVaultChest && !vaultOpened && (!hasCopperKey || !hasSilverCrest) && node.lockedText) {
    narrativeText = node.lockedText;
  } else if ((isDoor || isPlate) && adventure.hiddenDoorOpen && node.afterText) {
    narrativeText = node.afterText;
  } else if (
    !isClara &&
    !isVaultChest &&
    !isDoor &&
    !isPlate &&
    node.afterText &&
    ((node.itemId && itemCollected) || (node.questId && adventure.completedQuests.includes(node.questId)))
  ) {
    narrativeText = node.afterText;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[#DDD7C5] bg-[#FAF8F2] text-[#1C2420] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E7E2D3] bg-[#F3EFE3] px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#5A6760]">{node.subtitle}</div>
            <h2 id="inspect-modal-title" className="mt-0.5 font-display text-xl font-bold text-[#1C2420]">
              {node.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspection dialog"
            className="rounded-md p-1.5 text-[#5A6760] hover:bg-black/5 hover:text-[#1C2420]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-sm leading-relaxed text-[#2A342F]">{narrativeText}</p>

          {/* Clara's satchel progress */}
          {isClara && !claraDone && (
            <div className="rounded-lg border border-[#E2DAC4] bg-white p-3.5 text-xs">
              <div className="flex items-center justify-between font-semibold text-[#1C2420]">
                <span>Lost Herb Satchels Returned</span>
                <span className="font-mono tabular-nums text-[#2D6A4F]">{satchelsCollected} / 3</span>
              </div>
              <p className="mt-1.5 text-[#526059]">
                {satchelsCollected === 3
                  ? 'All three satchels are in your group pouch! Clara is handing over Grandfather’s Ledger and the Copper Field Key.'
                  : 'Search north along the road toward the Sunflower Garden fence for woven herb satchels.'}
              </p>
            </div>
          )}

          {/* Pressure plate live indicator */}
          {(isPlate || isDoor) && !adventure.hiddenDoorOpen && (
            <div className="rounded-lg border border-[#E2DAC4] bg-white p-3.5 text-xs space-y-2">
              <div className="font-semibold text-[#1C2420]">Twin Pressure Mechanism</div>
              <div className="flex items-center gap-4 text-[#47554E]">
                <span>
                  West Stone:{' '}
                  <strong className={adventure.activePlates.plateA ? 'text-[#2D6A4F]' : 'text-[#8C6D3B]'}>
                    {adventure.activePlates.plateA ? 'Pressed' : 'Waiting'}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  East Stone:{' '}
                  <strong className={adventure.activePlates.plateB ? 'text-[#2D6A4F]' : 'text-[#8C6D3B]'}>
                    {adventure.activePlates.plateB ? 'Pressed' : 'Waiting'}
                  </strong>
                </span>
              </div>
              <p className="text-[#526059]">
                Step onto both stones together with a friend—or walk quickly from one stone to the other within 12 seconds while the brass chime holds the latch.
              </p>
            </div>
          )}

          {/* Founder's Vault Chest key check */}
          {isVaultChest && !vaultOpened && (
            <div className="rounded-lg border border-[#DECFA8] bg-[#FCF7EA] p-4 space-y-3">
              <div className="text-xs font-semibold text-[#664A15]">Vault Keyholes</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  {hasCopperKey ? (
                    <CheckCircle2 className="h-4 w-4 text-[#2D6A4F] shrink-0" />
                  ) : (
                    <Lock className="h-4 w-4 text-[#9A7B42] shrink-0" />
                  )}
                  <span className={hasCopperKey ? 'text-[#1C2420] font-medium' : 'text-[#736446]'}>
                    Copper Field Key {hasCopperKey ? '· Ready' : '· Earn from Clara the Archivist'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {hasSilverCrest ? (
                    <CheckCircle2 className="h-4 w-4 text-[#2D6A4F] shrink-0" />
                  ) : (
                    <Lock className="h-4 w-4 text-[#9A7B42] shrink-0" />
                  )}
                  <span className={hasSilverCrest ? 'text-[#1C2420] font-medium' : 'text-[#736446]'}>
                    Silver Vault Crest {hasSilverCrest ? '· Ready' : '· Solve the Four-Emblem Ruins Altar'}
                  </span>
                </div>
              </div>
              {canOpenVault && (
                <button
                  type="button"
                  onClick={onUnlockVaultChest}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#23553F] transition-colors"
                >
                  <Unlock className="h-4 w-4" />
                  <span>Unlock Founder&apos;s Treasure Chest</span>
                </button>
              )}
            </div>
          )}

          {/* Discovered Clue Parchment */}
          {clue && clueDiscovered && (
            <div className="rounded-lg border border-[#DCD2B6] bg-[#FFFDF7] p-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#7A591E]">
                <ScrollText className="h-3.5 w-3.5" />
                <span>{clue.title}</span>
              </div>
              <p className="text-sm leading-relaxed text-[#252E29] whitespace-pre-line">{clue.body}</p>
              <div className="pt-1 text-[11px] text-[#6E7A73]">
                {clue.author} · Saved to Field Journal
              </div>
            </div>
          )}

          {/* Reward item confirmation */}
          {item && itemCollected && (
            <div className="flex items-start gap-3 rounded-lg border border-[#C9DED0] bg-[#EDF6F0] p-3.5">
              <Sparkles className="mt-0.5 h-4 w-4 text-[#2D6A4F] shrink-0" />
              <div className="text-xs">
                <div className="font-semibold text-[#1B4332]">Group Item Collected: {item.name}</div>
                <p className="mt-0.5 text-[#375A48]">{item.description}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#E7E2D3] bg-[#F3EFE3] px-5 py-3">
          <button
            type="button"
            onClick={onOpenJournal}
            className="flex items-center gap-1.5 rounded-lg border border-[#D4CEBC] bg-white px-3.5 py-2 text-xs font-semibold text-[#2A342F] hover:bg-[#FAF8F2]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Open Field Journal</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#1C2420] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3D36]"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

interface DialLockPuzzleModalProps {
  node: AdventureNodeDef;
  adventure: AdventureState;
  puzzleFeedback: PuzzleFeedbackState | null;
  onSubmitCode: (code: string) => void;
  onOpenJournal: () => void;
  onClose: () => void;
}

export const DialLockPuzzleModal: React.FC<DialLockPuzzleModalProps> = ({
  node,
  adventure,
  puzzleFeedback,
  onSubmitCode,
  onOpenJournal,
  onClose,
}) => {
  const [digits, setDigits] = useState<[number, number, number]>([0, 0, 0]);
  const [revealedHints, setRevealedHints] = useState(0);

  const solved = adventure.openedChests.includes(node.id);
  const questDef = ADVENTURE_QUESTS.find((q) => q.id === 'q3_dial_chest');
  const relevantClues = ['clue_clara_ledger', 'clue_west_signpost', 'clue_pasture_fence']
    .filter((id) => adventure.discoveredClues.includes(id))
    .map((id) => ADVENTURE_CLUES[id]);

  const adjustDigit = (index: 0 | 1 | 2, delta: number) => {
    setDigits((prev) => {
      const next = [...prev] as [number, number, number];
      next[index] = (next[index] + delta + 10) % 10;
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitCode(digits.join(''));
  };

  const activeFeedback = puzzleFeedback && puzzleFeedback.nodeId === node.id ? puzzleFeedback : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dial-puzzle-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[#DDD7C5] bg-[#FAF8F2] text-[#1C2420] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E7E2D3] bg-[#F3EFE3] px-5 py-4">
          <div>
            <div className="text-xs font-medium text-[#5A6760]">{node.subtitle}</div>
            <h2 id="dial-puzzle-title" className="mt-0.5 font-display text-xl font-bold text-[#1C2420]">
              {node.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chest puzzle"
            className="rounded-md p-1.5 text-[#5A6760] hover:bg-black/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-5 space-y-5">
          {solved ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-[#C9DED0] bg-[#EDF6F0] p-4">
                <Unlock className="mt-0.5 h-5 w-5 text-[#2D6A4F] shrink-0" />
                <div className="text-sm text-[#1B4332]">
                  <p className="font-semibold">Chest Unlocked!</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#355A47]">
                    {node.afterText}
                  </p>
                </div>
              </div>
              {ADVENTURE_CLUES.clue_satchel_journal && (
                <div className="rounded-lg border border-[#DCD2B6] bg-[#FFFDF7] p-4 space-y-1.5">
                  <div className="text-xs font-semibold text-[#7A591E]">
                    {ADVENTURE_CLUES.clue_satchel_journal.title}
                  </div>
                  <p className="text-sm leading-relaxed text-[#252E29]">
                    {ADVENTURE_CLUES.clue_satchel_journal.body}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm leading-relaxed text-[#2A342F]">
                Turn the three brass dials to match Alden Mercer&apos;s village counts from Grandfather&apos;s Ledger and nearby signs.
              </p>

              {/* 3 Tactile Brass Dial Wheels */}
              <div className="flex items-center justify-center gap-4 py-2">
                {([0, 1, 2] as const).map((idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center rounded-xl border border-[#D4C7A6] bg-[#F2EBD7] p-2.5 shadow-inner"
                  >
                    <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#6D5B36]">
                      Dial {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustDigit(idx, 1)}
                      aria-label={`Increase dial ${idx + 1}`}
                      className="flex h-8 w-14 items-center justify-center rounded-md bg-white/80 text-[#3F341D] hover:bg-white border border-[#DED4B9]"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <div className="my-2 flex h-14 w-14 items-center justify-center rounded-lg border-2 border-[#B39458] bg-[#241E14] font-mono text-2xl font-bold text-[#F5DE9E] tabular-nums shadow-inner">
                      {digits[idx]}
                    </div>
                    <button
                      type="button"
                      onClick={() => adjustDigit(idx, -1)}
                      aria-label={`Decrease dial ${idx + 1}`}
                      className="flex h-8 w-14 items-center justify-center rounded-md bg-white/80 text-[#3F341D] hover:bg-white border border-[#DED4B9]"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {activeFeedback && (
                <div
                  role="status"
                  className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                    activeFeedback.solved
                      ? 'border-[#C9DED0] bg-[#EDF6F0] text-[#1B4332]'
                      : 'border-[#E5BCB8] bg-[#FDF2F2] text-[#8E2A2A]'
                  }`}
                >
                  {activeFeedback.message}
                </div>
              )}

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#23553F] transition-colors"
              >
                <KeyRound className="h-4 w-4" />
                <span>Try Combination ({digits.join(' - ')})</span>
              </button>

              {/* Discovered Clues Reference */}
              <div className="rounded-lg border border-[#E5DFCE] bg-white p-3.5 space-y-2">
                <div className="text-xs font-semibold text-[#1C2420]">
                  Your Discovered Clues ({relevantClues.length} found)
                </div>
                {relevantClues.length === 0 ? (
                  <p className="text-xs text-[#5A6760]">
                    Talk to Clara west of the plaza or read the West Avenue Signpost and Southwest Pasture Board to find the exact numbers—no guessing needed!
                  </p>
                ) : (
                  <ul className="space-y-2 text-xs text-[#38443E]">
                    {relevantClues.map((c) => (
                      <li key={c.id} className="border-t border-[#F0ECE0] pt-2 first:border-0 first:pt-0">
                        <span className="font-semibold text-[#1C2420]">{c.title}: </span>
                        <span>{c.body}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Progressive Hints */}
              {questDef && questDef.hints.length > 0 && (
                <div className="rounded-lg border border-[#E5DFCE] bg-[#F7F4EA] p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#6E521C]">
                      <Lightbulb className="h-3.5 w-3.5" />
                      <span>Need a hint?</span>
                    </span>
                    {revealedHints < questDef.hints.length && (
                      <button
                        type="button"
                        onClick={() => setRevealedHints((n) => Math.min(questDef.hints.length, n + 1))}
                        className="text-xs font-semibold text-[#2D6A4F] hover:underline"
                      >
                        Show Hint {revealedHints + 1} of {questDef.hints.length}
                      </button>
                    )}
                  </div>
                  {revealedHints > 0 && (
                    <ol className="list-decimal pl-4 space-y-1 text-xs text-[#463A20]">
                      {questDef.hints.slice(0, revealedHints).map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </form>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#E7E2D3] bg-[#F3EFE3] px-5 py-3">
          <button
            type="button"
            onClick={onOpenJournal}
            className="flex items-center gap-1.5 rounded-lg border border-[#D4CEBC] bg-white px-3.5 py-2 text-xs font-semibold text-[#2A342F] hover:bg-[#FAF8F2]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Field Journal</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#1C2420] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3D36]"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

interface EmblemOrderPuzzleModalProps {
  node: AdventureNodeDef;
  adventure: AdventureState;
  puzzleFeedback: PuzzleFeedbackState | null;
  onSubmitOrder: (order: EmblemSymbolId[]) => void;
  onOpenJournal: () => void;
  onClose: () => void;
}

export const EmblemOrderPuzzleModal: React.FC<EmblemOrderPuzzleModalProps> = ({
  node,
  adventure,
  puzzleFeedback,
  onSubmitOrder,
  onOpenJournal,
  onClose,
}) => {
  const [sequence, setSequence] = useState<EmblemSymbolId[]>([]);
  const [revealedHints, setRevealedHints] = useState(0);

  const solved = adventure.solvedPuzzles.includes(node.id);
  const questDef = ADVENTURE_QUESTS.find((q) => q.id === 'q6_symbol_altar');
  const hasTowerClue = adventure.discoveredClues.includes('clue_lantern_inscription');
  const activeFeedback = puzzleFeedback && puzzleFeedback.nodeId === node.id ? puzzleFeedback : null;

  const handleToggleEmblem = (id: EmblemSymbolId) => {
    setSequence((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="altar-puzzle-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[#DDD7C5] bg-[#FAF8F2] text-[#1C2420] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E7E2D3] bg-[#F3EFE3] px-5 py-4">
          <div>
            <div className="text-xs font-medium text-[#5A6760]">{node.subtitle}</div>
            <h2 id="altar-puzzle-title" className="mt-0.5 font-display text-xl font-bold text-[#1C2420]">
              {node.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close altar puzzle"
            className="rounded-md p-1.5 text-[#5A6760] hover:bg-black/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-5 space-y-5">
          {solved ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-[#C9DED0] bg-[#EDF6F0] p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#2D6A4F] shrink-0" />
                <div className="text-sm text-[#1B4332]">
                  <p className="font-semibold">Altar Awakened!</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#355A47]">{node.afterText}</p>
                </div>
              </div>
              {ADVENTURE_CLUES.clue_ruins_plates && (
                <div className="rounded-lg border border-[#DCD2B6] bg-[#FFFDF7] p-4 space-y-1.5">
                  <div className="text-xs font-semibold text-[#7A591E]">
                    {ADVENTURE_CLUES.clue_ruins_plates.title}
                  </div>
                  <p className="text-sm leading-relaxed text-[#252E29]">
                    {ADVENTURE_CLUES.clue_ruins_plates.body}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-[#2A342F]">
                Place Pixelfield&apos;s four stone emblems into slots 1 through 4 in the exact order inscribed on the Northeast Lantern Tower plaque.
              </p>

              {/* 4 Ordered Pedestal Slots */}
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((slotIdx) => {
                  const placedId = sequence[slotIdx];
                  const option = EMBLEM_OPTIONS.find((o) => o.id === placedId);
                  return (
                    <button
                      key={slotIdx}
                      type="button"
                      disabled={!placedId}
                      onClick={() => {
                        if (placedId) handleToggleEmblem(placedId);
                      }}
                      className={`flex min-h-[76px] flex-col items-center justify-center rounded-lg border p-2 text-center transition-colors ${
                        option
                          ? 'border-[#2D6A4F] bg-[#EDF6F0] text-[#1B4332]'
                          : 'border-dashed border-[#C9C1AD] bg-[#F3EFE3] text-[#7D847B]'
                      }`}
                    >
                      <span className="font-mono text-[10px] font-semibold opacity-75">
                        #{slotIdx + 1}
                      </span>
                      <span className="mt-1 text-xs font-semibold leading-tight">
                        {option ? option.label : 'Empty'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selectable Emblems */}
              <div className="grid grid-cols-2 gap-2.5">
                {EMBLEM_OPTIONS.map((opt) => {
                  const slotPos = sequence.indexOf(opt.id);
                  const picked = slotPos !== -1;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleToggleEmblem(opt.id)}
                      className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors ${
                        picked
                          ? 'border-[#2D6A4F] bg-[#EDF4EF] text-[#1B4332]'
                          : 'border-[#DDD7C5] bg-white text-[#1C2420] hover:bg-[#F7F4EA]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="mt-0.5 text-[11px] text-[#5A6760]">{opt.caption}</div>
                      </div>
                      {picked && (
                        <span className="font-mono text-xs font-bold text-[#2D6A4F] shrink-0">
                          #{slotPos + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {activeFeedback && (
                <div
                  role="status"
                  className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                    activeFeedback.solved
                      ? 'border-[#C9DED0] bg-[#EDF6F0] text-[#1B4332]'
                      : 'border-[#E5BCB8] bg-[#FDF2F2] text-[#8E2A2A]'
                  }`}
                >
                  {activeFeedback.message}
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSequence([])}
                  disabled={sequence.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-[#D4CEBC] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#3B4640] hover:bg-[#F5F2E8] disabled:opacity-45"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  disabled={sequence.length !== 4}
                  onClick={() => onSubmitOrder(sequence)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#23553F] disabled:bg-[#B8C4BC] disabled:text-[#58655E]"
                >
                  <Check className="h-4 w-4" />
                  <span>Confirm Emblem Order</span>
                </button>
              </div>

              {/* Lantern Tower Clue reference */}
              <div className="rounded-lg border border-[#E5DFCE] bg-white p-3.5 text-xs">
                <div className="font-semibold text-[#1C2420]">Lantern Tower Inscription</div>
                {hasTowerClue ? (
                  <p className="mt-1 leading-relaxed text-[#38443E]">
                    {ADVENTURE_CLUES.clue_lantern_inscription.body}
                  </p>
                ) : (
                  <p className="mt-1 text-[#5A6760]">
                    You haven&apos;t inspected the Northeast Lantern Tower yet. Visit Rowan and the Lantern Tower across the northeast pond bridge to read the exact sequence.
                  </p>
                )}
              </div>

              {questDef && questDef.hints.length > 0 && (
                <div className="rounded-lg border border-[#E5DFCE] bg-[#F7F4EA] p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#6E521C]">
                      <Lightbulb className="h-3.5 w-3.5" />
                      <span>Need a hint?</span>
                    </span>
                    {revealedHints < questDef.hints.length && (
                      <button
                        type="button"
                        onClick={() => setRevealedHints((n) => Math.min(questDef.hints.length, n + 1))}
                        className="text-xs font-semibold text-[#2D6A4F] hover:underline"
                      >
                        Show Hint {revealedHints + 1} of {questDef.hints.length}
                      </button>
                    )}
                  </div>
                  {revealedHints > 0 && (
                    <ol className="list-decimal pl-4 space-y-1 text-xs text-[#463A20]">
                      {questDef.hints.slice(0, revealedHints).map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#E7E2D3] bg-[#F3EFE3] px-5 py-3">
          <button
            type="button"
            onClick={onOpenJournal}
            className="flex items-center gap-1.5 rounded-lg border border-[#D4CEBC] bg-white px-3.5 py-2 text-xs font-semibold text-[#2A342F] hover:bg-[#FAF8F2]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Field Journal</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#1C2420] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3D36]"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

interface FieldJournalModalProps {
  adventure: AdventureState;
  initialTab?: 'quests' | 'clues' | 'satchel';
  onClose: () => void;
}

export const FieldJournalModal: React.FC<FieldJournalModalProps> = ({
  adventure,
  initialTab = 'quests',
  onClose,
}) => {
  const [tab, setTab] = useState<'quests' | 'clues' | 'satchel'>(initialTab);
  const [hintCounts, setHintCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const metrics = getStoryProgressMetrics(adventure);
  const activeQuest = getActiveQuest(adventure);

  const discoveredClueDefs = adventure.discoveredClues
    .map((id) => ADVENTURE_CLUES[id])
    .filter(Boolean);

  const hasMap1 = adventure.collectedItems.includes('map_fragment_1');
  const hasMap2 = adventure.collectedItems.includes('map_fragment_2');
  const hasMap3 = adventure.collectedItems.includes('map_fragment_3');
  const mapCount = [hasMap1, hasMap2, hasMap3].filter(Boolean).length;

  const keyAndRelicItems = adventure.collectedItems
    .map((id) => ADVENTURE_ITEMS[id])
    .filter((item) => item && item.category !== 'curio' && item.category !== 'map');

  const curioIds = ['curio_spyglass', 'curio_carved_duck', 'curio_bell_clapper'];
  const collectedCurios = curioIds
    .filter((id) => adventure.collectedItems.includes(id))
    .map((id) => ADVENTURE_ITEMS[id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[84vh] max-h-[720px] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#DDD7C5] bg-[#FAF8F2] text-[#1C2420] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[#E7E2D3] bg-[#F3EFE3] px-5 py-4">
          <div>
            <div className="text-xs font-medium text-[#5A6760] tabular-nums">
              {adventure.chapterTitle} · {metrics.completedCount}/{metrics.totalCount} Quests ({metrics.percent}%)
            </div>
            <h2 id="journal-modal-title" className="mt-0.5 font-display text-2xl font-bold text-[#1C2420]">
              Explorer&apos;s Field Journal
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Field Journal"
            className="rounded-md p-1.5 text-[#5A6760] hover:bg-black/5 hover:text-[#1C2420]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Clean Tab Bar */}
        <div className="flex items-center gap-6 border-b border-[#E7E2D3] bg-[#F7F4EA] px-5 text-sm font-medium text-[#5A6760]">
          <button
            type="button"
            onClick={() => setTab('quests')}
            className={`flex items-center gap-1.5 border-b-2 py-3 transition-colors whitespace-nowrap ${
              tab === 'quests'
                ? 'border-[#2D6A4F] text-[#1C2420] font-semibold'
                : 'border-transparent hover:text-[#1C2420]'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Quests &amp; Hints</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('clues')}
            className={`flex items-center gap-1.5 border-b-2 py-3 transition-colors whitespace-nowrap tabular-nums ${
              tab === 'clues'
                ? 'border-[#2D6A4F] text-[#1C2420] font-semibold'
                : 'border-transparent hover:text-[#1C2420]'
            }`}
          >
            <ScrollText className="h-4 w-4" />
            <span>Clues &amp; Notes ({discoveredClueDefs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('satchel')}
            className={`flex items-center gap-1.5 border-b-2 py-3 transition-colors whitespace-nowrap tabular-nums ${
              tab === 'satchel'
                ? 'border-[#2D6A4F] text-[#1C2420] font-semibold'
                : 'border-transparent hover:text-[#1C2420]'
            }`}
          >
            <MapIcon className="h-4 w-4" />
            <span>Map &amp; Satchel</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {tab === 'quests' && (
            <>
              {metrics.isComplete ? (
                <div className="rounded-xl border border-[#B7D8C3] bg-[#EDF6F0] p-5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#1B4332]">
                    <Sparkles className="h-4 w-4" />
                    <span>Chapter 1 Complete — Pixelfield&apos;s Lost Treasure Found!</span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#2F5140]">
                    Your group uncovered Alden Mercer&apos;s secret sanctuary, opened the twin pressure stones together, and brought Pixelfield&apos;s Free Village Charter and Golden Astrolabe safely back to the village.
                  </p>
                  <p className="text-xs text-[#436855] tabular-nums">
                    Optional Village Curios discovered: {collectedCurios.length} / {curioIds.length}
                  </p>
                </div>
              ) : activeQuest ? (
                <div className="rounded-xl border border-[#DCD2B6] bg-white p-5 space-y-3 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7770]">
                    <span className="font-semibold text-[#2D6A4F]">
                      Current Quest · Step {activeQuest.order} of {metrics.totalCount}
                    </span>
                    <span>Area: {activeQuest.targetAreaLabel}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#1C2420]">{activeQuest.title}</h3>
                  <p className="text-sm font-medium text-[#1C2420]">{activeQuest.shortObjective}</p>
                  <p className="text-xs leading-relaxed text-[#4F5D56]">{activeQuest.storyReason}</p>
                  <div className="pt-1 text-xs text-[#6B7770]">
                    Reward: <strong className="font-semibold text-[#2A342F]">{activeQuest.rewardSummary}</strong>
                  </div>

                  {/* Progressive Hint Reveal */}
                  <div className="mt-3 rounded-lg border border-[#EAE2CC] bg-[#FAF7EE] p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#6E521C]">
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span>Helpful Hints</span>
                      </span>
                      {(hintCounts[activeQuest.id] ?? 0) < activeQuest.hints.length && (
                        <button
                          type="button"
                          onClick={() =>
                            setHintCounts((prev) => ({
                              ...prev,
                              [activeQuest.id]: Math.min(
                                activeQuest.hints.length,
                                (prev[activeQuest.id] ?? 0) + 1
                              ),
                            }))
                          }
                          className="text-xs font-semibold text-[#2D6A4F] hover:underline"
                        >
                          Reveal Hint {(hintCounts[activeQuest.id] ?? 0) + 1} of {activeQuest.hints.length}
                        </button>
                      )}
                    </div>
                    {(hintCounts[activeQuest.id] ?? 0) === 0 ? (
                      <p className="text-xs text-[#6B614B]">
                        Stuck on a clue? Click Reveal Hint for a gentle nudge without spoiling everything at once.
                      </p>
                    ) : (
                      <ol className="list-decimal pl-4 space-y-1.5 text-xs leading-relaxed text-[#3E3521]">
                        {activeQuest.hints.slice(0, hintCounts[activeQuest.id] ?? 0).map((hint, idx) => (
                          <li key={idx}>{hint}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Full 8-quest chapter log */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#66736C]">
                  Chapter 1 Story Trail
                </h4>
                <div className="divide-y divide-[#EBE6D8] overflow-hidden rounded-xl border border-[#E2DCCB] bg-white">
                  {ADVENTURE_QUESTS.map((q) => {
                    const done = adventure.completedQuests.includes(q.id);
                    const isCurrent = activeQuest?.id === q.id;
                    return (
                      <div key={q.id} className="flex items-start gap-3 px-4 py-3">
                        <div className="mt-0.5 shrink-0">
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 text-[#2D6A4F]" />
                          ) : (
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded-full border font-mono text-[10px] font-bold ${
                                isCurrent
                                  ? 'border-[#2D6A4F] bg-[#EDF6F0] text-[#2D6A4F]'
                                  : 'border-[#CFC9B8] text-[#848E88]'
                              }`}
                            >
                              {q.order}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                done
                                  ? 'text-[#4D5D55]'
                                  : isCurrent
                                  ? 'text-[#1C2420]'
                                  : 'text-[#6A7670]'
                              }`}
                            >
                              {q.title}
                            </span>
                            <span className="text-[11px] text-[#7A867F] shrink-0">
                              {done ? 'Completed' : isCurrent ? 'Active' : q.targetAreaLabel}
                            </span>
                          </div>
                          {(done || isCurrent) && (
                            <p className="mt-0.5 text-xs text-[#59665F]">{q.shortObjective}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === 'clues' && (
            <div className="space-y-3">
              {discoveredClueDefs.length === 0 ? (
                <div className="rounded-xl border border-[#E2DCCB] bg-white p-6 text-center text-sm text-[#5A6760]">
                  No clues recorded yet. Inspect the Central Stone Well in Pixelfield Plaza to find Alden Mercer&apos;s first note.
                </div>
              ) : (
                discoveredClueDefs.map((clue) => (
                  <article
                    key={clue.id}
                    className="rounded-xl border border-[#E0D8C2] bg-[#FFFDF7] p-4 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#1C2420]">{clue.title}</h3>
                      <span className="text-xs text-[#6B7770]">{clue.location}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-[#2C3731]">{clue.body}</p>
                    <div className="pt-1 text-[11px] text-[#7A857E]">— {clue.author}</div>
                  </article>
                ))
              )}
            </div>
          )}

          {tab === 'satchel' && (
            <div className="space-y-5">
              {/* Assembled 3-Piece Village Treasure Map */}
              <div className="rounded-xl border border-[#DCCFB0] bg-[#F7F1DF] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#4D3B18]">Alden&apos;s Village Treasure Map</h3>
                  <span className="font-mono text-xs font-semibold text-[#6F5523] tabular-nums">
                    {mapCount} / 3 Fragments
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      found: hasMap1,
                      num: 'I · West',
                      title: 'Pasture & Footprints',
                      desc: 'Broken south fence → muddy bootprints → hollow oak stump.',
                    },
                    {
                      found: hasMap2,
                      num: 'II · East',
                      title: 'Bridge & Lantern Pond',
                      desc: 'Cross northeast bridge → Rowan → Lantern Tower plaque.',
                    },
                    {
                      found: hasMap3,
                      num: 'III · Sanctuary',
                      title: 'Southeast Ruins',
                      desc: 'Four-emblem altar → twin pressure stones → Founder’s Cavern.',
                    },
                  ].map((frag) => (
                    <div
                      key={frag.num}
                      className={`rounded-lg border p-3 text-xs ${
                        frag.found
                          ? 'border-[#BDA572] bg-[#FFFDF5] text-[#2F2513]'
                          : 'border-dashed border-[#D3C7A9] bg-[#EFE7D1]/70 text-[#8F8062]'
                      }`}
                    >
                      <div className="font-mono text-[10px] font-bold uppercase">{frag.num}</div>
                      <div className="mt-1 font-semibold">
                        {frag.found ? frag.title : 'Missing Piece'}
                      </div>
                      <p className="mt-1 text-[11px] leading-snug">
                        {frag.found ? frag.desc : 'Explore village clues to recover this fragment.'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shared Keys & Story Relics */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#66736C]">
                  Shared Keys &amp; Story Items
                </h4>
                {keyAndRelicItems.length === 0 ? (
                  <p className="rounded-lg border border-[#E2DCCB] bg-white p-4 text-xs text-[#5A6760]">
                    Items found by anyone in your room appear here and are shared by the whole group.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {keyAndRelicItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-[#E2DCCB] bg-white p-3.5 text-xs"
                      >
                        <div className="font-semibold text-[#1C2420]">{item.name}</div>
                        <p className="mt-1 text-[#56645D] leading-relaxed">{item.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional Bonus Curios */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#66736C]">
                    Hidden Village Curios (Bonus)
                  </h4>
                  <span className="font-mono text-xs text-[#5A6760] tabular-nums">
                    {collectedCurios.length} / {curioIds.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {curioIds.map((id) => {
                    const found = adventure.collectedItems.includes(id);
                    const def = ADVENTURE_ITEMS[id];
                    return (
                      <div
                        key={id}
                        className={`rounded-lg border p-3 text-xs ${
                          found
                            ? 'border-[#C9DED0] bg-[#EDF6F0] text-[#1B4332]'
                            : 'border-[#E5E0D0] bg-white text-[#7A857E]'
                        }`}
                      >
                        <div className="font-semibold">{found ? def.name : 'Undiscovered Curio'}</div>
                        <p className="mt-1 text-[11px] leading-snug">
                          {found ? def.description : 'Tucked quietly near a cottage, shore, or roadside bench.'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E7E2D3] bg-[#F3EFE3] px-5 py-3 text-xs text-[#5A6760]">
          <span>Progress, keys, and clues are shared across everyone in this room.</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#1C2420] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2F3D36]"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
