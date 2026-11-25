/**
 * The Fable Experiment: a separate version of the game with its own art direction and a few gameplay changes, kept in
 * one place so every choice can be read with its reason (and switched off with `?fable=0` to compare with the game it
 * started from). It has its own save.
 *
 * The idea: **every ride is one night.** The game's own rule is "one trip, one sleep" (evening requests, lights out,
 * morning requests, arrival), but the world never showed it: it was held at one moonlit moment for the whole session.
 * Here the sky is the ride's clock: stations stand in warm afternoon light (the busiest part of play is also the
 * brightest and easiest to read), the train pulls out into golden hour and sunset while guests settle in, night falls
 * as they go to bed, and it rolls into the next station at sunrise. The journey rhythm, the pillar of the design,
 * becomes something the player sees and feels every two minutes, and each leg has a colour script of its own.
 */
const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('fable') : null;
export const FABLE: boolean = fromUrl !== '0';

/** A key of the ride's sky (Lighting's `Key` without importing it: config stays free of the world layer). */
export interface SkyKey {
  t: number;
  sky: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunIntensity: number;
  /** 0 by day, 1 at night: lamps, window glow, fireflies and the night grade follow it. */
  night: number;
  env: number;
  fog: number;
}

export const FABLE_CLOCK = {
  /** Where on the ride clock a stop stands, and how far it drifts while the doors are open (over `stopDriftSeconds`). */
  stop: 0.0,
  stopDrift: 0.07,
  stopDriftSeconds: 70,
  /** The ride clock where the train's own run starts and ends: ride progress 0…1 maps onto this span. */
  rideFrom: 0.07,
  rideTo: 0.93,
  /** How quickly the sky eases toward its target (per second), so a jump in the journey never pops the light. */
  ease: 0.9,
};

/**
 * The ride's colour script. The clock runs 0 (a station in the afternoon) to 1 (the next station): golden hour by
 * 0.14, sunset by 0.27, the blue hour by 0.36, night from 0.42 (guests' lights out is 40% of the ride) to 0.60, first
 * light at 0.68 (morning starts at 64%), a peach dawn by 0.79, a clear morning by 0.91.
 * Low ambient with a strong warm key by day (shape and contrast, never the flat washed look of a high ambient), the
 * night kept short and a little lighter than before so it is a mood, not the place the player has to work in the dark.
 */
export const FABLE_SKY: SkyKey[] = [
  { t: 0.0, sky: '#BFE3F2', hemiSky: '#FFEFD8', hemiGround: '#6E7E58', hemi: 1.0, sun: '#FFE2B4', sunIntensity: 3.7, night: 0, env: 0.85, fog: 0.005 },
  { t: 0.14, sky: '#F2C79A', hemiSky: '#FFD2A8', hemiGround: '#5A3E38', hemi: 0.8, sun: '#FFB36A', sunIntensity: 4.3, night: 0.08, env: 0.75, fog: 0.005 },
  { t: 0.27, sky: '#E58A6C', hemiSky: '#FFA98A', hemiGround: '#4A3142', hemi: 0.74, sun: '#FF8A58', sunIntensity: 3.3, night: 0.34, env: 0.7, fog: 0.007 },
  { t: 0.36, sky: '#4C4F8A', hemiSky: '#A090CC', hemiGround: '#322E4E', hemi: 0.82, sun: '#C79CDA', sunIntensity: 1.4, night: 0.78, env: 0.6, fog: 0.008 },
  { t: 0.42, sky: '#23284F', hemiSky: '#5A5486', hemiGround: '#2A2030', hemi: 0.74, sun: '#A9AEE6', sunIntensity: 1.1, night: 1, env: 0.55, fog: 0.008 },
  { t: 0.6, sky: '#23284F', hemiSky: '#5A5486', hemiGround: '#2A2030', hemi: 0.74, sun: '#A9AEE6', sunIntensity: 1.1, night: 1, env: 0.55, fog: 0.008 },
  { t: 0.68, sky: '#6C6AA2', hemiSky: '#C6A6C6', hemiGround: '#3C3650', hemi: 0.84, sun: '#FFB0A2', sunIntensity: 1.7, night: 0.62, env: 0.62, fog: 0.008 },
  { t: 0.79, sky: '#F6BBA2', hemiSky: '#FFD2BE', hemiGround: '#66525C', hemi: 0.86, sun: '#FFBE96', sunIntensity: 3.5, night: 0.14, env: 0.75, fog: 0.007 },
  { t: 0.91, sky: '#CDE8F2', hemiSky: '#FFF3E2', hemiGround: '#76865E', hemi: 1.0, sun: '#FFEBCB', sunIntensity: 3.5, night: 0, env: 0.85, fog: 0.005 },
  { t: 1.0, sky: '#BFE3F2', hemiSky: '#FFEFD8', hemiGround: '#6E7E58', hemi: 1.0, sun: '#FFE2B4', sunIntensity: 3.7, night: 0, env: 0.85, fog: 0.005 },
];

/** Gameplay changes of the experiment (each explained where it is used). */
export const FABLE_PLAY = {
  /**
   * Sunrise tips: as the sun comes up (the ride's morning), every sleeper who went to bed content (nothing asked for
   * and never got, not kept waiting) leaves a little extra, paid in one burst with a "Sunrise" card. Why: the night was
   * the leg's dead stretch (guests asleep, nothing landing); now the evening's service has a visible payoff at dawn,
   * so each leg has a second beat between stations and a reason to serve the evening well.
   */
  sunrise: { perGuest: 3, minGuests: 1 },
  /**
   * Reviews you can see: a guest getting off shows the stars they leave (the Train Rating was already the average of
   * these, but silently). Why: a rating the player cannot see being made feels arbitrary; five gold stars over a happy
   * guest is the game saying "that is what good service looks like".
   */
  reviewStars: true,
};

/**
 * Sun shadows on the higher tiers: with a real sun for most of the ride, walls and furniture throwing shadows across
 * the floors is what gives the dollhouse depth and weight (by night it only added murk, which is why it was off). It is
 * the train's one static shadow map, redrawn only when the train changes, so it costs nothing per frame. The phone
 * tiers (Low, Medium) keep the proven path without shadow maps until this is checked on real phones.
 */
export const FABLE_TIERS = {
  high: { shadows: 'static' as const },
  ultra: { shadows: 'static' as const },
};
