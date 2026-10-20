import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isChainId, type ChainId, type UserSettings } from '@trenchscope/shared';
import { EyeOff, Monitor, Save, Settings, SlidersHorizontal, UserRound } from 'lucide-react';
import { AccountGate, useSignedIn } from '@/components/account';
import { AccountSection } from '@/components/account/settings/AccountSection';
import { BlacklistSection } from '@/components/account/settings/BlacklistSection';
import { DisplaySettingsForm } from '@/components/account/settings/DisplaySettingsForm';
import { dirtyChains, sameSettings, savable, validateSettings } from '@/components/account/settings/model';
import { TradingSettings } from '@/components/account/settings/TradingSettings';
import { UnsavedChangesGuard } from '@/components/account/settings/UnsavedChangesGuard';
import { Page, PageHeader } from '@/components/layout';
import { Button, ErrorState, Kbd, Panel, Tabs } from '@/components/ui';
import { useActiveChain, useHotkeys } from '@/hooks';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';

type Section = 'trading' | 'display' | 'blacklist' | 'account';
const SECTIONS: Section[] = ['trading', 'display', 'blacklist', 'account'];

export default function SettingsPage() {
  const signedIn = useSignedIn();
  return (
    <Page className="max-w-[1100px]">
      {!signedIn && <Header />}
      <AccountGate
        icon={<Settings size={22} />}
        title="Make the terminal yours"
        description="Sign in to tune slippage, priority fees and anti-MEV per chain, set your quick-buy buttons, display units and risk thresholds."
        features={['Three buy and sell presets per chain', 'Quick-buy amounts and one-click instant buy', 'Risk-chip thresholds, compact rows, confirmations']}
      >
        <SettingsLoader />
      </AccountGate>
    </Page>
  );
}

function SettingsLoader() {
  const saved = useSession((s) => s.settings);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (saved) return <SettingsEditor saved={saved} />;
  const retry = async () => {
    setRetrying(true);
    try {
      useSession.setState({ settings: await api.settings() });
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setRetrying(false);
    }
  };
  return (
    <>
      <Header />
      <Panel>{error ? <ErrorState error={error} onRetry={() => void retry()} retrying={retrying} /> : <ErrorState title="Settings didn’t load" onRetry={() => void retry()} retrying={retrying} />}</Panel>
    </>
  );
}

function Header({ actions }: { actions?: ReactNode }) {
  return <PageHeader title="Settings" subtitle="Trading presets, display preferences, blacklist and your account" icon={<Settings size={16} />} actions={actions} />;
}

function SettingsEditor({ saved }: { saved: UserSettings }) {
  const activeChain = useActiveChain();
  const [params, setParams] = useSearchParams();
  const sectionParam = params.get('section') as Section | null;
  const section: Section = sectionParam && SECTIONS.includes(sectionParam) ? sectionParam : 'trading';
  const chainParam = params.get('chain');
  const chain: ChainId = isChainId(chainParam) ? chainParam : activeChain;

  const [draft, setDraft] = useState<UserSettings>(() => structuredClone(saved));
  const [pending, setPending] = useState(false);
  const dirty = !sameSettings(draft, saved);
  const errors = useMemo(() => validateSettings(draft), [draft]);
  const errorCount = Object.keys(errors).length;
  const changedChains = useMemo(() => dirtyChains(draft, saved), [draft, saved]);
  const displayDirty = JSON.stringify(savable(draft).display) !== JSON.stringify(savable(saved).display);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  /** Saves the draft; true once nothing is left unsaved. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (pending) return false;
    if (errorCount > 0) {
      toast.error('Fix the highlighted fields', Object.values(errors)[0]);
      return false;
    }
    setPending(true);
    try {
      const sent = savable(draft);
      await useSession.getState().saveSettings(sent);
      const next = useSession.getState().settings;
      if (next) {
        const adjusted = !sameSettings(next, draft);
        setDraft(structuredClone(next));
        toast.success('Settings saved', adjusted ? 'Some values were outside the allowed range and were adjusted.' : 'Your presets and preferences are updated.');
      }
      return true;
    } catch (err) {
      toast.error('Could not save settings', errorMessage(err));
      return false;
    } finally {
      setPending(false);
    }
  }, [dirty, pending, errorCount, errors, draft]);

  const discard = () => setDraft(structuredClone(saved));

  useHotkeys({ 'mod+s': () => void save() }, { allowInInputs: true });

  // Warn before closing the tab with unsaved edits (in-app navigation: UnsavedChangesGuard).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const dot = <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="unsaved changes" />;

  return (
    <>
      <UnsavedChangesGuard dirty={dirty} onSave={save} canSave={errorCount === 0} />
      <Header
        actions={
          <Button variant="primary" size="sm" icon={<Save size={14} />} disabled={!dirty} loading={pending} onClick={() => void save()} title="Save (Ctrl/⌘ + S)">
            Save
          </Button>
        }
      />
      <Tabs
        value={section}
        onChange={(s) => setParam('section', s === 'trading' ? null : s)}
        aria-label="Settings sections"
        className="mb-3"
        items={[
          { value: 'trading', label: <span className="inline-flex items-center gap-1.5">Trading{changedChains.size > 0 && dot}</span>, icon: <SlidersHorizontal size={13} /> },
          { value: 'display', label: <span className="inline-flex items-center gap-1.5">Display{displayDirty && dot}</span>, icon: <Monitor size={13} /> },
          { value: 'blacklist', label: 'Blacklist', icon: <EyeOff size={13} /> },
          { value: 'account', label: 'Account', icon: <UserRound size={13} /> },
        ]}
      />
      <div role="tabpanel">
        {section === 'trading' && (
          <TradingSettings
            chain={chain}
            onChain={(c) => setParam('chain', c)}
            value={draft.trade[chain]}
            onChange={(next) => setDraft((d) => ({ ...d, trade: { ...d.trade, [chain]: next } }))}
            errors={errors}
            dirty={changedChains}
          />
        )}
        {section === 'display' && <DisplaySettingsForm value={draft.display} onChange={(display) => setDraft((d) => ({ ...d, display }))} errors={errors} />}
        {section === 'blacklist' && <BlacklistSection />}
        {section === 'account' && <AccountSection />}
      </div>

      {dirty && (
        <div data-sticky-bottom className="sticky bottom-0 z-sticky -mx-3 mt-3 border-t border-line bg-panel/95 px-3 py-2.5 backdrop-blur md:-mx-4 md:px-4" role="region" aria-label="Unsaved changes">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-fg">Unsaved changes</span>
            {errorCount > 0 ? (
              <span className="text-xs text-down">
                {errorCount} field{errorCount === 1 ? '' : 's'} to fix
              </span>
            ) : (
              <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex">
                <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd>+<Kbd>S</Kbd> to save
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={discard} disabled={pending}>
                Discard
              </Button>
              <Button variant="primary" size="sm" icon={<Save size={13} />} loading={pending} disabled={errorCount > 0} onClick={() => void save()}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
