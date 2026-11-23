/**
 * The battle store stages a matchup between /battle/find and the post-fight
 * screen: pre-fight reads the cards, match.tsx runs the sim and writes the
 * result + recorded inputs, post-fight reads the submission outcome.
 */

import { create } from "zustand";
import type { BattleFind, BattleResult } from "@cx/shared";
import type { MatchResult } from "@cx/battle-engine";

interface BattleState {
  find: BattleFind | null;
  localResult: MatchResult | null;
  inputs: { a: number[]; b: number[] } | null;
  submission: BattleResult | null;
  stage: (find: BattleFind) => void;
  finishLocal: (result: MatchResult, inputs: { a: number[]; b: number[] }) => void;
  setSubmission: (submission: BattleResult) => void;
  reset: () => void;
}

export const useBattle = create<BattleState>((set) => ({
  find: null,
  localResult: null,
  inputs: null,
  submission: null,
  stage: (find) => set({ find, localResult: null, inputs: null, submission: null }),
  finishLocal: (localResult, inputs) => set({ localResult, inputs }),
  setSubmission: (submission) => set({ submission }),
  reset: () => set({ find: null, localResult: null, inputs: null, submission: null }),
}));
