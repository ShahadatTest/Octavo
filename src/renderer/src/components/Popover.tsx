import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface Anchor {
  left: number
  top: number
  right: number
  bottom: number
}

interface PopoverProps {
  anchor: Anchor
  onClose(): void
  children: ReactNode
  className?: string
  /** Prefer opening above the anchor (selection popovers) or below it (menus). */
  placement?: 'above' | 'below'
  align?: 'center' | 'start' | 'end'
}

const MARGIN = 8

/** A floating panel next to an anchor rectangle, kept inside the window; closes on outside click and Esc. */
export function Popover({ anchor, onClose, children, className = 'popover', placement = 'below', align = 'start' }: PopoverProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left =
      align === 'center' ? (anchor.left + anchor.right) / 2 - w / 2 : align === 'end' ? anchor.right - w : anchor.left
    left = Math.max(MARGIN, Math.min(vw - w - MARGIN, left))
    const above = anchor.top - h - MARGIN
    const below = anchor.bottom + MARGIN
    let top = placement === 'above' ? (above >= 48 ? above : below) : below + h <= vh - MARGIN ? below : above
    top = Math.max(MARGIN, Math.min(vh - h - MARGIN, top))
    setPos({ left, top })
  }, [anchor.left, anchor.top, anchor.right, anchor.bottom, placement, align, children])

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className={className}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  )
}

export const rectOf = (el: Element): Anchor => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

export const pointAnchor = (x: number, y: number): Anchor => ({ left: x, top: y, right: x, bottom: y })
