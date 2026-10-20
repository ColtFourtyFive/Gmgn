import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { Button, Modal } from '@/components/ui';

export interface UnsavedChangesGuardProps {
  dirty: boolean;
  /** Saves the draft; resolves false when it could not (the user stays). */
  onSave: () => Promise<boolean>;
  /** Saving is impossible right now (fields to fix). */
  canSave?: boolean;
}

/**
 * Asks before an in-app navigation drops unsaved edits: Save, Discard or
 * Stay (closing or reloading the tab is covered by `beforeunload`). Moving
 * within the page (a search-param change, e.g. another settings section)
 * is not leaving it. Needs a data router (main.tsx).
 */
export function UnsavedChangesGuard({ dirty, onSave, canSave = true }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  const [saving, setSaving] = useState(false);
  const blocked = blocker.state === 'blocked';

  // Saved or discarded some other way while the prompt was up: nothing is lost any more.
  useEffect(() => {
    if (blocked && !dirty) blocker.proceed();
  }, [blocked, dirty, blocker]);

  const stay = () => blocker.reset?.();
  const save = async () => {
    setSaving(true);
    const ok = await onSave();
    setSaving(false);
    if (ok) blocker.proceed?.();
    else blocker.reset?.();
  };

  return (
    <Modal
      open={blocked}
      onClose={stay}
      size="sm"
      bodyClassName={canSave ? '!pb-0' : undefined}
      title="Leave with unsaved changes?"
      description="Your edits to these settings are not saved yet."
      footer={
        <>
          <Button variant="ghost" onClick={stay} data-autofocus>
            Stay
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()} disabled={saving}>
            Discard
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!canSave}>
            Save and leave
          </Button>
        </>
      }
    >
      {!canSave && <p className="text-sm text-down">Some fields need fixing before they can be saved.</p>}
    </Modal>
  );
}
