import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'

export function Toast(): ReactNode {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className={`toast ${toast.kind === 'error' ? 'toast--error' : ''}`} role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run()
            useStore.getState().dismissToast()
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button aria-label="Dismiss" onClick={() => useStore.getState().dismissToast()} style={{ textDecoration: 'none', display: 'grid' }}>
        <X size={14} />
      </button>
    </div>
  )
}
