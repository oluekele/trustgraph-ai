import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from './cx';

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('w-full overflow-x-auto', className)}>{children}</div>;
}

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cx('w-full border-collapse text-left text-[13px]', className)} {...rest} />;
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-2 text-[11px] tracking-wide text-muted uppercase">
      {children}
    </thead>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cx('border-b border-line px-3 py-2 font-semibold', className)} {...rest} />;
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx('border-b border-line px-3 py-2.5 align-top', className)} {...rest} />;
}

export function Tr({ className, onClick, selected, ...rest }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cx(
        onClick && 'cursor-pointer hover:bg-surface-2',
        selected && 'bg-accent-soft',
        className,
      )}
      onClick={onClick}
      {...rest}
    />
  );
}
