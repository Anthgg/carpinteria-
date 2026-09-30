import { AlertDialog } from '@heroui/react/alert-dialog';
import type { ReactNode } from 'react';

/** Confirmación modal (HeroUI AlertDialog): foco atrapado, Escape cancela, el botón de acción queda explícito. */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancelar', tone = 'danger', onConfirm, onCancel }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string;
  tone?: 'danger' | 'warning'; onConfirm: () => void; onCancel: () => void;
}) {
  return <AlertDialog.Backdrop isOpen={open} onOpenChange={(next) => { if (!next) onCancel(); }} isKeyboardDismissDisabled={false} className="confirm-dialog__backdrop">
    <AlertDialog.Container size="sm" className="confirm-dialog">
      <AlertDialog.Dialog className="confirm-dialog__dialog">
        <AlertDialog.Header className="confirm-dialog__header">
          <AlertDialog.Icon status={tone} className={`confirm-dialog__icon confirm-dialog__icon--${tone}`} />
          <AlertDialog.Heading className="confirm-dialog__title">{title}</AlertDialog.Heading>
        </AlertDialog.Header>
        <AlertDialog.Body className="confirm-dialog__body">{children}</AlertDialog.Body>
        <AlertDialog.Footer className="confirm-dialog__footer">
          <button type="button" className="button button--quiet" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`button ${tone === 'danger' ? 'button--danger' : 'button--primary'}`} onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </AlertDialog.Footer>
      </AlertDialog.Dialog>
    </AlertDialog.Container>
  </AlertDialog.Backdrop>;
}
