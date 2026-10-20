import type { ReactNode } from 'react';
import { Button, Modal } from '@/components/ui';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  /** Destructive action: red button, and Cancel gets the initial focus. */
  danger?: boolean;
  /** Tone of the confirm button for trades. */
  tone?: 'primary' | 'buy' | 'sell';
  pending?: boolean;
  /** Confirm stays unavailable (e.g. until a risk acknowledgement is ticked); Cancel gets the initial focus. */
  confirmDisabled?: boolean;
  children?: ReactNode;
}

/** Small yes/no dialog for deletes and confirm-before-trade. */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger, tone = 'primary', pending, confirmDisabled, children }: ConfirmDialogProps) {
  const cancelFirst = danger || confirmDisabled;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      bodyClassName={children ? undefined : '!pb-0'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus={cancelFirst || undefined}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : tone} loading={pending} disabled={confirmDisabled} onClick={onConfirm} data-autofocus={cancelFirst ? undefined : true}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? null}
    </Modal>
  );
}
