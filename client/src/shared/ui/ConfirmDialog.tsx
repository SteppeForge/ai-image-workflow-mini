import { Button } from './Button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  // Без дефолтов: подписи обязаны идти через словарь i18n.
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div
        className="w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-2 text-sm font-bold text-neutral-100">{title}</h2>
        <p className="mb-4 text-xs text-neutral-400">{message}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} autoFocus>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
