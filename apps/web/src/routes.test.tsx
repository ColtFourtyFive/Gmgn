import { describe, expect, it } from 'vitest';
import { DemoOnly, RootRedirect } from '@/routeGuards';
import { ROUTES, routePath } from '@/routes';

describe('route table', () => {
  it('has one row per path, the root redirect first and the catch-all last', () => {
    const paths = ROUTES.map(routePath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(ROUTES[0]).toMatchObject({ path: '/', component: RootRedirect, chainScoped: false });
    expect(paths.at(-1)).toBe('*');
  });

  it('mounts chain sections under /:chain/ and account pages at the root', () => {
    const paths = ROUTES.map(routePath);
    expect(paths).toContain('/:chain/trenches');
    expect(paths).toContain('/:chain/token/:address');
    expect(paths).toContain('/portfolio');
    expect(paths).toContain('/settings');
    expect(ROUTES.filter((r) => r.guard === DemoOnly).map(routePath)).toEqual(['/:chain/launch']);
  });
});
