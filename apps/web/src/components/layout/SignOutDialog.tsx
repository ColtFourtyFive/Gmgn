import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { ConfirmDialog } from '@/components/account/ConfirmDialog';
import { Button } from '@/components/ui';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';

async function signOutNow(): Promise<void> {
  await useSession.getState().logout();
  toast.info('Signed out');
}

/**
 * Every "Sign out" entry point (account menu, phone drawer, command palette,
 * Settings → Account) goes through here. A guest account has no password, so
 * signing out loses it for good: guests confirm first (SignOutDialog);
 * registered accounts can log back in and sign out at once.
 */
export function requestSignOut(): void {
  const s = useSession.getState();
  if (s.account?.isGuest) s.promptSignOut(true);
  else void signOutNow();
}

/** Confirmation for signing out of a guest account (mounted once by AppShell). */
export function SignOutDialog() {
  const open = useSession((s) => s.signOutPrompt);
  const [pending, setPending] = useState(false);
  const close = () => useSession.getState().promptSignOut(false);

  const confirm = async () => {
    setPending(true);
    try {
      await signOutNow();
    } finally {
      setPending(false);
      close();
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      onConfirm={() => void confirm()}
      pending={pending}
      danger
      title="Sign out of this guest account?"
      description="This is a guest account: once you sign out it cannot be recovered, with its wallets, positions and settings. Register first to keep it."
      confirmLabel="Sign out"
    >
      <Button
        size="sm"
        variant="outline"
        icon={<UserPlus size={13} />}
        onClick={() => {
          close();
          useSession.getState().promptAuth(true, 'register');
        }}
      >
        Register instead
      </Button>
    </ConfirmDialog>
  );
}
