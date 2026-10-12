import { useEffect, useLayoutEffect, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { ModalPortal } from './Modal';

const POPOVER_WIDTH = 290;

/**
 * Small popover anchored to a chip in the day header (☕, 🏃): rendered into <body> so table cells
 * don't clip it, placed below the chip — or above when there is not enough room below — and kept
 * inside the viewport. Closes on outside click and Escape.
 */
export function DayPopover({ anchorRef, onClose, label, estimatedHeight = 260, children }: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  label: string;
  /** Room the content needs below the anchor before it opens upwards instead. */
  estimatedHeight?: number;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom > estimatedHeight || r.top < estimatedHeight;
      setPos(below
        ? { top: r.bottom + 4, left, width }
        : { bottom: window.innerHeight - r.top + 4, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, estimatedHeight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalPortal>
      <div className="coffee-popover-backdrop" onClick={onClose} />
      <div className="coffee-popover" style={pos} role="dialog" aria-label={label} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </ModalPortal>
  );
}
