'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { cx } from './cx';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** "modal" is centred; "drawer" slides in from the right. */
  variant?: 'modal' | 'drawer';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const MODAL_SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
const DRAWER_SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** Native <dialog> (focus trapping, Esc to close, inert background). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
  size = 'md',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const drawer = variant === 'drawer';
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="tg-dialog-title"
      className={cx(
        'm-0 border border-line bg-surface p-0 text-fg shadow-[var(--shadow-lg)] backdrop:bg-black/45',
        drawer
          ? cx('fixed inset-y-0 right-0 left-auto h-full max-h-none w-full', DRAWER_SIZES[size])
          : cx('fixed inset-0 m-auto h-fit max-h-[88vh] w-[calc(100%-2rem)] rounded-lg', MODAL_SIZES[size]),
      )}
    >
      {open ? (
        <div className={cx('flex flex-col', drawer ? 'h-full' : 'max-h-[88vh]')}>
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <h2 id="tg-dialog-title" className="text-[15px] font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
