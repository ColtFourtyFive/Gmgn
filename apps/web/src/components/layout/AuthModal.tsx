import { useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CHAIN_IDS, CHAINS } from '@trenchscope/shared';
import { Rocket } from 'lucide-react';
import { ChainIcon, SimBanner } from '@/components/common';
import { Button, Input, Field, Modal, Tabs } from '@/components/ui';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';

type AuthTab = 'quick' | 'login' | 'register';

const TABS = [
  { value: 'quick' as const, label: 'Quick start' },
  { value: 'login' as const, label: 'Log in' },
  { value: 'register' as const, label: 'Register' },
];
/** A signed-in guest registers to keep the account (upgraded in place), or logs into another one. */
const GUEST_TABS = [TABS[2], TABS[1]];

function welcome(): void {
  const name = useSession.getState().account?.username;
  toast.success(name ? `Welcome, ${name}` : 'Welcome', 'Your paper wallets are funded on every chain.');
}

/** Run an auth action with pending/error state. */
function useAuthAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
      welcome();
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed'));
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
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
  const { pending, error, run } = useAuthAction();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(referral);
  const ids = useId();
  const register = mode === 'register';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = useSession.getState();
    void run(() => (register ? s.register(username.trim(), password, code.trim() || undefined) : s.login(username.trim(), password)));
  };

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
      <Field label="Password" htmlFor={`${ids}-p`} hint={register ? 'At least 6 characters.' : undefined}>
        <Input
          id={`${ids}-p`}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={register ? 'new-password' : 'current-password'}
          required
          minLength={register ? 6 : 1}
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

/** Tab state lives here: Modal mounts its content fresh on every open, so each open starts on the right tab. */
function AuthTabs({ guest, referral }: { guest: boolean; referral: string }) {
  const [tab, setTab] = useState<AuthTab>(guest ? 'register' : 'quick');
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={guest ? GUEST_TABS : TABS} aria-label="Sign-in method" className="mb-3" />
      {tab === 'quick' ? <QuickStart referral={referral} /> : <CredentialsForm key={tab} mode={tab} referral={referral} />}
    </>
  );
}

/**
 * Sign-in dialog. Opens when `session.authPrompt` is set (Sign in button,
 * requireAuth(), "Register account" for guests) and closes itself on
 * success. Reads ?ref= for referrals.
 */
export function AuthModal() {
  const open = useSession((s) => s.authPrompt);
  const guest = useSession((s) => !!s.account?.isGuest);
  const [params] = useSearchParams();
  const referral = params.get('ref') ?? '';

  return (
    <Modal
      open={open}
      onClose={() => useSession.getState().promptAuth(false)}
      title={guest ? 'Keep your paper account' : 'Start trading on Trenchscope'}
      description={
        guest
          ? 'Pick a username and password: your wallets, positions and settings carry over, and you can sign in from anywhere.'
          : 'Paper-trade the trenches with real-time simulated markets.'
      }
      size="sm"
    >
      <AuthTabs guest={guest} referral={referral} />
    </Modal>
  );
}
