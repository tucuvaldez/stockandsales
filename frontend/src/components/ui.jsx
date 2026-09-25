import { useEffect, useRef, useState } from "react";

export function Modal({ title, onClose, children, footer, width = 560, closeOnOverlay = true }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => closeOnOverlay && e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">✕</button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export const Loader = ({ text = "Cargando..." }) => (
  <div className="loader"><div className="spinner" /> {text}</div>
);

export const Empty = ({ icon = "📭", title, children }) => (
  <div className="empty-state card">
    <div className="empty-icon">{icon}</div>
    <p>{title}</p>
    {children && <small>{children}</small>}
  </div>
);

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button className="btn btn-secondary btn-sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>← Anterior</button>
      <span>Página {page} de {pages}</span>
      <button className="btn btn-secondary btn-sm" onClick={() => onChange(page + 1)} disabled={page >= pages}>Siguiente →</button>
    </div>
  );
}

export const Field = ({ label, required, hint, children, className = "" }) => (
  <label className={`form-group ${className}`}>
    <span className="form-label">{label} {required && <span>*</span>}</span>
    {children}
    {hint && <span className="form-hint">{hint}</span>}
  </label>
);

export const Badge = ({ kind = "neutral", children }) => <span className={`badge badge-${kind}`}>{children}</span>;

// Diálogo de confirmación que reemplaza a window.confirm y puede pedir un motivo.
export function Confirm({ title, message, confirmLabel = "Confirmar", danger, askReason, reasonLabel = "Motivo", onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), []);

  const submit = async () => {
    if (askReason && !reason.trim()) return inputRef.current?.focus();
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={busy ? undefined : onClose}
      width={440}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} onClick={submit} disabled={busy}>{busy ? "Procesando..." : confirmLabel}</button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
      {askReason && (
        <Field label={reasonLabel} required>
          <input ref={inputRef} className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} maxLength={300} />
        </Field>
      )}
    </Modal>
  );
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
