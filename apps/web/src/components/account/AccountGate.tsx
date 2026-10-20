import type { ReactNode } from 'react';
import { Check, LogIn, Rocket, UserPlus } from 'lucide-react';
import { SimBanner } from '@/components/common';
import { Button, ErrorState, Skeleton, SkeletonText } from '@/components/ui';
import { useIsLive } from '@/hooks/useMode';
import { useSession } from '@/store/session';

export interface AccountGateProps {
  /** Large icon for the signed-out card (lucide element, ~22px). */
  icon: ReactNode;
  /** Signed-out headline, e.g. "Track your paper portfolio". */
  title: string;
  description: string;
  /** Short benefit bullets shown under the description. */
  features?: string[];
  /** Rendered once signed in. */
  children: ReactNode;
}

/** True once the account is loaded (signed in, settings fetched). */
export function useSignedIn(): boolean {
  return useSession((s) => !!s.account);
}

/**
 * Renders `children` for signed-in users. Signed-out visitors get a friendly
 * explanation and a "Start paper trading" button (live: "Create account"),
 * which opens the auth modal;
 * while a stored token is being verified a skeleton avoids flashing the gate,
 * and once an attempt failed (API down or erroring) the error with a Retry
 * (the session store keeps retrying in the background too).
 */
export function AccountGate({ icon, title, description, features, children }: AccountGateProps) {
  const signedIn = useSignedIn();
  const verifying = useSession((s) => !!s.token && !s.ready);
  const restoreError = useSession((s) => s.restoreError);
  const restoring = useSession((s) => s.restoring);
  const live = useIsLive();
  if (signedIn) return <>{children}</>;
  if (verifying && restoreError != null) {
    return (
      <div className="panel">
        <ErrorState title="Couldn’t load your account" error={restoreError} onRetry={() => useSession.getState().retryRestore()} retrying={restoring} />
      </div>
    );
  }
  if (verifying) return <GateSkeleton />;
  return (
    <div className="flex justify-center py-6 md:py-12">
      <section className="panel flex w-full max-w-lg flex-col items-center gap-4 px-5 py-8 text-center sm:px-8" aria-labelledby="gate-title">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">{icon}</span>
        <div className="flex flex-col gap-1.5">
          <h2 id="gate-title" className="text-lg font-semibold text-fg">
            {title}
          </h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
        {features && features.length > 0 && (
          <ul className="flex w-full flex-col gap-1.5 text-left">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-fg">
                <Check size={14} className="mt-0.5 shrink-0 text-up" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {live ? (
            <Button variant="primary" icon={<UserPlus size={14} />} onClick={() => useSession.getState().promptAuth(true, 'register')}>
              Create account
            </Button>
          ) : (
            <Button variant="primary" icon={<Rocket size={14} />} onClick={() => useSession.getState().promptAuth(true, 'quick')}>
              Start paper trading
            </Button>
          )}
          <Button variant="outline" icon={<LogIn size={14} />} onClick={() => useSession.getState().promptAuth(true, 'login')}>
            Log in
          </Button>
        </div>
        <p className="text-xs text-faint">
          {live
            ? 'Your account comes with its own Solana wallet. Deposit SOL to trade; withdrawals need two-factor authentication.'
            : 'Free guest account in one click — every chain comes pre-funded with paper money.'}
        </p>
        <SimBanner />
      </section>
    </div>
  );
}

function GateSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading account">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="panel p-3">
        <SkeletonText lines={5} />
      </div>
    </div>
  );
}
