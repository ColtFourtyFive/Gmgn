import { Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { ChainGuard } from '@/routeGuards';
import { ROUTES, routePath, type AppRoute } from '@/routes';
import { useSession } from '@/store/session';

export { ChainGuard, DemoOnly, RootRedirect } from '@/routeGuards';

function PageFallback() {
  return <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted">Loading…</div>;
}

/** A row's element: the page inside its guard, inside ChainGuard when chain-scoped. */
function routeElement({ component: Page, chainScoped, guard: Guard }: AppRoute) {
  const page = Guard ? (
    <Guard>
      <Page />
    </Guard>
  ) : (
    <Page />
  );
  return chainScoped ? <ChainGuard>{page}</ChainGuard> : page;
}

export default function App() {
  const init = useSession((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {ROUTES.map((r) => (
            <Route key={routePath(r)} path={routePath(r)} element={routeElement(r)} />
          ))}
        </Routes>
      </Suspense>
    </AppShell>
  );
}
