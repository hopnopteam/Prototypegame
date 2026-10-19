// What the simulation tells the presentation each step. Plain data, so it runs headless.

export type EndReason = 'crash' | 'battery' | 'exit' | 'quit';

export type SimEvent =
  | { type: 'bump'; x: number; y: number; nx: number; ny: number; speed: number }
  | { type: 'hit'; x: number; y: number; nx: number; ny: number; speed: number; damage: number; integrity: number }
  | { type: 'overheatWarn' }
  | { type: 'sputter' }
  | { type: 'sputterEnd' }
  | { type: 'liftoff' }
  | { type: 'rest'; ledge: string; first: boolean }
  | { type: 'patchIncoming'; ledge: string }
  | { type: 'patch'; ledge: string; integrity: number }
  | { type: 'patchCancel'; ledge: string }
  | { type: 'batteryEmpty' }
  | { type: 'crash' }
  | { type: 'plateOff'; index: number }
  | { type: 'towStart' }
  | { type: 'towAttach' }
  | { type: 'exit' }
  | { type: 'end'; reason: EndReason };
