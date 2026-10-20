import { useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CHAIN_IDS, CHAINS } from '@trenchscope/shared';
import { ArrowLeft, ExternalLink, KeyRound, Rocket } from 'lucide-react';
import { ChainIcon, SimBanner } from '@/components/common';
import { isTotpOrRecoveryCode } from '@/components/funds/model';
import { TotpInput } from '@/components/funds/TotpInput';
import { Button, Input, Field, Modal, Tabs } from '@/components/ui';
import { useDemoUrl, useIsLive } from '@/hooks/useMode';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { isLiveMode } from '@/lib/mode';
import { clearReferral, pendingReferral } from '@/lib/referral';
import { useSession, type AuthTab } from '@/store/session';
import { toast } from '@/store/toasts';

const TABS = [
  { value: 'quick' as const, label: 'Quick start' },
  { value: 'login' as const, label: 'Log in' },
  { value: 'register' as const, label: 'Register' },
];
/** A signed-in guest registers to keep the account (upgraded in place), or logs into another one. */
const GUEST_TABS = [TABS[2], TABS[1]];
/** Live: real funds, so no guest accounts. */
const LIVE_TABS = [TABS[1], TABS[2]];

/** Live passwords guard real funds: at least this long (the server enforces it too). */
export const LIVE_MIN_PASSWORD = 10;

function welcome(): void {
  const name = useSession.getState().account?.username;
  const title = name ? `Welcome, ${name}` : 'Welcome';
  if (isLiveMode()) toast.success(title, 'Deposit SOL to your wallet to start trading.');
  else toast.success(title, 'Your paper wallets are funded on every chain.');
}

/** The server wants the account's 2FA code: a 401 'totp_required' to a login. */
export function needsTotp(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401 && err.code === 'totp_required';
}

/**
 * Run an auth action with pending/error state. `onError` may claim an error
 * (return true: e.g. the 2FA step) so it is not shown as a failure.
 */
function useAuthAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>, onError?: (err: unknown) => boolean) => {
    setPending(true);
    setError(null);
    try {
      await fn();
      clearReferral();
      welcome();
    } catch (err) {
      if (!onError?.(err)) setError(errorMessage(err, 'Sign-in failed'));
    } finally {
      setPending(false);
    }
  };
  return { pending, error, setError, run };
}

function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="rounded border border-down/30 bg-down/10 px-2.5 py-1.5 text-sm text-down">
      {error}
    </p>
  ) : null;
}

function QuickStart({ referral }: { referral: string }) {
  const { pending, error, run } = useAuthAction();
  return (
    <div className="flex flex-col gap-3">
      <SimBanner variant="card" />
      <p className="text-sm text-muted">One click creates a guest paper-trading account with a starter balance on every chain:</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {CHAIN_IDS.map((c) => (
          <li key={c} className="flex items-center gap-2 rounded border border-line bg-panel-2 px-2.5 py-1.5 text-sm">
            <ChainIcon chain={c} size={16} />
            <span className="text-muted">{CHAINS[c].name}</span>
            <span className="num ml-auto font-semibold">
              {CHAINS[c].starterBalance} {CHAINS[c].nativeSymbol}
            </span>
          </li>
        ))}
      </ul>
      <FormError error={error} />
      <Button variant="primary" block loading={pending} icon={<Rocket size={14} />} onClick={() => void run(() => useSession.getState().guest(referral || undefined))} data-autofocus>
        Start paper trading
      </Button>
      <p className="text-center text-xs text-faint">Guest accounts live in this browser. Register to sign in from anywhere.</p>
    </div>
  );
}

function CredentialsForm({ mode, referral }: { mode: 'login' | 'register'; referral: string }) {
  const { pending, error, setError, run } = useAuthAction();
  const live = useIsLive();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(referral);
  // Second login step (live accounts with 2FA): the server answered 401 'totp_required'.
  const [totpStep, setTotpStep] = useState(false);
  const ids = useId();
  const register = mode === 'register';
  const minPassword = live ? LIVE_MIN_PASSWORD : 6;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = useSession.getState();
    if (register && live && password.length < LIVE_MIN_PASSWORD) {
      setError(`Use at least ${LIVE_MIN_PASSWORD} characters for your password.`);
      return;
    }
    void run(
      () => (register ? s.register(username.trim(), password, code.trim() || undefined) : s.login(username.trim(), password)),
      (err) => {
        if (register || !needsTotp(err)) return false;
        setTotpStep(true);
        return true;
      },
    );
  };

  if (totpStep) {
    return (
      <TotpStep
        username={username.trim()}
        password={password}
        onBack={() => {
          setTotpStep(false);
          setPassword('');
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Username" htmlFor={`${ids}-u`}>
        <Input
          id={`${ids}-u`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          minLength={3}
          maxLength={24}
          data-autofocus
        />
      </Field>
      <Field label="Password" htmlFor={`${ids}-p`} hint={register ? `At least ${minPassword} characters.` : undefined}>
        <Input
          id={`${ids}-p`}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={register ? 'new-password' : 'current-password'}
          required
          minLength={register ? minPassword : 1}
        />
      </Field>
      {register && (
        <Field label="Referral code (optional)" htmlFor={`${ids}-r`}>
          <Input id={`${ids}-r`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
        </Field>
      )}
      <FormError error={error} />
      <Button type="submit" variant="primary" block loading={pending}>
        {register ? 'Create account' : 'Log in'}
      </Button>
    </form>
  );
}

/** Second login step: the 6-digit code from the account's authenticator app. */
function TotpStep({ username, password, onBack }: { username: string; password: string; onBack: () => void }) {
  const { pending, error, setError, run } = useAuthAction();
  const [code, setCode] = useState('');
  const ids = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isTotpOrRecoveryCode(code)) {
      setError('Enter the 6-digit code from your authenticator app, or a recovery code.');
      return;
    }
    void run(
      () => useSession.getState().login(username, password, code),
      (err) => {
        if (!needsTotp(err)) return false;
        setCode('');
        setError('That code didn’t work. Enter the current 6-digit code from your authenticator app, or an unused recovery code.');
        return true;
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-label="Two-step verification">
      <p className="flex items-start gap-2 text-sm text-muted">
        <KeyRound size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span>
          <span className="font-medium text-fg">Two-step verification.</span> Enter the 6-digit code from the authenticator app linked to{' '}
          <span className="font-medium text-fg">{username}</span>.
        </span>
      </p>
      <Field label="Authentication code" htmlFor={`${ids}-c`} hint="Lost your device? Use one of your recovery codes.">
        <TotpInput id={`${ids}-c`} value={code} onChange={setCode} allowRecovery data-autofocus autoFocus required />
      </Field>
      <FormError error={error} />
      <Button type="submit" variant="primary" block loading={pending}>
        Verify and log in
      </Button>
      <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-1 text-xs font-medium text-muted hover:text-fg">
        <ArrowLeft size={12} aria-hidden />
        Back
      </button>
    </form>
  );
}

/**
 * Tab state lives here: Modal mounts its content fresh on every open, so each
 * open starts on the requested tab (promptAuth(true, tab)) or the default.
 * Live has no guest quick start: it opens on Log in instead.
 */
function AuthTabs({ guest, referral, initialTab }: { guest: boolean; referral: string; initialTab: AuthTab | null }) {
  const live = useIsLive();
  const [tab, setTab] = useState<AuthTab>(() => {
    const fallback = guest ? 'register' : live ? 'login' : 'quick';
    // Guests already have an account: no quick start for them (nor for anyone in live).
    return initialTab && !((guest || live) && initialTab === 'quick') ? initialTab : fallback;
  });
  const items = guest ? GUEST_TABS : live ? LIVE_TABS : TABS;
  const shown = live && tab === 'quick' ? 'login' : tab;
  return (
    <>
      <Tabs value={shown} onChange={setTab} items={items} aria-label="Sign-in method" className="mb-3" />
      {guest && tab === 'login' && (
        <p className="mb-3 rounded border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-sm text-fg">
          Logging into another account leaves this guest account behind: it has no password, so it cannot be recovered afterwards. Register it first to keep its
          wallets, positions and settings.
        </p>
      )}
      {shown === 'quick' ? <QuickStart referral={referral} /> : <CredentialsForm key={shown} mode={shown} referral={referral} />}
      {live && <TryDemoLink />}
    </>
  );
}

/** Live: where to practise with paper balances first (MetaResponse.demoUrl). */
function TryDemoLink() {
  const demoUrl = useDemoUrl();
  if (!demoUrl) return null;
  return (
    <p className="mt-3 text-center text-xs text-muted">
      New to the trenches?{' '}
      <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
        Try the demo with paper balances
        <ExternalLink size={11} aria-hidden />
      </a>
    </p>
  );
}

/**
 * Sign-in dialog. Opens when `session.authPrompt` is set (Sign in button,
 * requireAuth(), "Register account" for guests) on `session.authTab` when
 * given, and closes itself on success. Pre-fills the referral code from ?ref=
 * or the code this tab landed with.
 */
export function AuthModal() {
  const open = useSession((s) => s.authPrompt);
  const initialTab = useSession((s) => s.authTab);
  const guest = useSession((s) => !!s.account?.isGuest);
  const live = useIsLive();
  const [params] = useSearchParams();
  // The landing URL's code survives redirects and browsing (see lib/referral).
  const referral = params.get('ref') ?? pendingReferral();

  return (
    <Modal
      open={open}
      onClose={() => useSession.getState().promptAuth(false)}
      title={guest ? 'Keep your paper account' : live ? 'Sign in to Trenchscope' : 'Start trading on Trenchscope'}
      description={
        guest
          ? 'Register a username and password: your wallets, positions and settings carry over, and you can sign in from anywhere.'
          : live
            ? 'Trade Solana memecoins from your own embedded wallet. Orders execute on Solana mainnet with real funds.'
            : 'Paper-trade the trenches with real-time simulated markets.'
      }
      size="sm"
    >
      <AuthTabs guest={guest} referral={referral} initialTab={initialTab} />
    </Modal>
  );
}
