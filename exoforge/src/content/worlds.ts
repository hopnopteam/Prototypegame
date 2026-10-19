// The worlds and their courses. Milestone 1 has World 1's first three chunks.
import { asChunk, type ChunkData } from '../sim/Course';
import w1_01 from './chunks/w1_01.json';
import w1_02 from './chunks/w1_02.json';
import w1_03 from './chunks/w1_03.json';

export interface WorldDef {
  index: number;
  name: string;
  /** Title-card line (SPEC A8). */
  line: string;
  chunks: ChunkData[];
  /** Sky or ambient top / bottom, environment main / accent, highlight (SPEC B14.3). */
  palette: { skyTop: string; skyBottom: string; main: string; accent: string; highlight: string };
}

export const WORLDS: Record<number, WorldDef> = {
  1: {
    index: 1,
    name: 'The Collapsed Mine',
    line: 'Climb out.',
    chunks: [w1_01, w1_02, w1_03].map(asChunk),
    palette: { skyTop: '#14121F', skyBottom: '#2B2236', main: '#5A4A42', accent: '#4FD1C5', highlight: '#FFB547' },
  },
};
