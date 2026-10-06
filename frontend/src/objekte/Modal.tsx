import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Schlichtes Modal (nutzt die vorhandenen .modal-Styles). Wird per Portal an
// document.body gehängt: So entstehen keine verschachtelten <form>-Elemente
// (ungültiges HTML, löst native Absendungen aus), auch wenn ein Modal aus einem
// Formular heraus geöffnet wird. Mehrere Modale lassen sich stapeln.
export default function Modal({
  titel,
  onSchliessen,
  children,
}: {
  titel: string
  onSchliessen: () => void
  children: ReactNode
}) {
  return createPortal(
    <div className="modal-overlay" onClick={onSchliessen}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{titel}</h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
