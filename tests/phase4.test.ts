import { describe, expect, it } from 'vitest';
import { SAVE_MIGRATIONS } from '../src/save/SaveSystem';
import { createDefaultSave, SAVE_VERSION } from '../src/save/SaveData';
import { carryOver } from '../src/sim/carryOver';
import { COUNTRYSIDE_EXPRESS, MAX_TRAIN_CARRIAGES, nextRoute, RIVIERA_COAST, routeById, ROUTES, UPCOMING_ROUTES } from '../src/config/routes';
import { translate } from '../src/services/gaMapping';

describe('Phase 4: more than one route', () => {
  it('lists the routes in order, Riviera after the Countryside, Winter City still to come', () => {
    expect(ROUTES.map((r) => r.id)).toEqual(['countryside', 'riviera']);
    expect(nextRoute('countryside')?.id).toBe('riviera');
    expect(nextRoute('riviera')).toBeNull();
    expect(routeById('nowhere')).toBeNull();
    expect(UPCOMING_ROUTES.map((r) => r.id)).toContain('winter');
    for (const r of ROUTES) expect(r.maxCarriages).toBeLessThanOrEqual(MAX_TRAIN_CARRIAGES);
  });

  it('prices the Riviera ×2.5 and its fares ×2 over the Countryside', () => {
    expect(COUNTRYSIDE_EXPRESS.economy.priceMultiplier).toBe(1);
    expect(RIVIERA_COAST.economy.priceMultiplier).toBe(2.5);
    expect(RIVIERA_COAST.economy.fareMultiplier).toBe(2);
  });

  it('migrates a v7 save: the route keeps its play time, no archives yet', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(8);
    const raw: Record<string, unknown> = { route: { id: 'countryside' }, profile: { lifetimePlaySeconds: 5400 } };
    SAVE_MIGRATIONS.find((m) => m.from === 7)?.apply(raw);
    expect((raw.route as { playSeconds: number }).playSeconds).toBe(5400);
    expect(raw.routes).toEqual({});
    expect(raw.completedRoutes).toEqual([]);
  });

  it('archives the finished route, marks it completed and starts the hand work again', () => {
    const save = createDefaultSave(1000, 'id');
    save.route.id = 'countryside';
    save.route.level = 8;
    save.route.carriages = ['lobby', 'cafe'];
    save.route.playSeconds = 9000;
    save.wallet = { cash: 777, gems: 40, railMiles: 12 };
    save.conductor = { speed: 3, capacity: 2, fareBonus: 1 };
    save.press.stats.guests = 420;
    save.profile.handWork = { rooms: 40 };
    save.staff = { attendant_0: { level: 2 } };
    save.station.owned.countryside = ['posters'];
    const { data, cashLeft } = carryOver(save, 'riviera', 2000, 5);
    expect(cashLeft).toBe(777);
    expect(data.route.id).toBe('riviera');
    expect(data.route.level).toBe(1);
    expect(data.wallet).toEqual({ cash: 0, gems: 40, railMiles: 12 });
    expect(data.conductor).toEqual({ speed: 3, capacity: 2, fareBonus: 1 });
    expect(data.staff).toEqual({});
    expect(data.profile.handWork).toEqual({});
    expect(data.completedRoutes).toEqual(['countryside']);
    const archive = data.routes.countryside;
    expect(archive.route.level).toBe(8);
    expect(archive.staff).toEqual({ attendant_0: { level: 2 } });
    expect(archive.stationOwned).toEqual(['posters']);
    expect(archive.unbought).toBe(5);
    expect(archive.stats).toEqual({ guests: 420, perfectStops: 0, minutes: 150 });
    expect(data.station.owned.riviera).toEqual([]);
  });

  it('names the route events for GameAnalytics', () => {
    expect(translate('route_complete', { route: 'countryside', time: 9000 })[0]).toMatchObject({ id: 'Route:Complete:countryside', value: 150 });
    expect(translate('route_unlock', { route: 'riviera', time: 9600 })[0]).toMatchObject({ id: 'Route:Unlock:riviera', value: 160 });
    expect(translate('route_leave', { route: 'countryside', unbought: 0 })[0]).toMatchObject({ id: 'Route:Leave:countryside:Complete' });
    expect(translate('route_leave', { route: 'countryside', unbought: 7 })[0]).toMatchObject({ id: 'Route:Leave:countryside:Partial', value: 7 });
    expect(translate('route_transition_skipped', { seconds: 1.4 })[0]).toMatchObject({ id: 'Route:TransitionSkipped' });
    expect(translate('route_map_opened', {})[0]).toMatchObject({ id: 'RouteMap:Opened' });
    expect(translate('kids_noise', { seconds: 12 })[0]).toMatchObject({ id: 'Kids:Noise:12' });
    expect(translate('honeymoon_dnd', { respected: true })[0]).toMatchObject({ id: 'Honeymoon:DND:respected' });
    expect(translate('spa_massage', { fee: 30 })[0]).toMatchObject({ id: 'Spa:Massage' });
    expect(translate('pool_skim', {})[0]).toMatchObject({ id: 'Pool:Skim' });
  });
});
