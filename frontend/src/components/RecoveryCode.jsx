import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import { useAuth } from "../auth";
import { Confirm } from "./ui";
import { dateTime } from "../lib/format";

// Muestra el código con opción de imprimirlo. Al imprimir, sale solo esta tarjeta.
export function RecoveryCodeBox({ code }) {
  const { config } = useAuth();
  return (
    <div className="recovery-box print-only-area">
      <div className="recovery-title">StockLocal · {config?.negocio}</div>
      <div className="recovery-label">Código de recuperación del administrador</div>
      <div className="recovery-code">{code}</div>
      <div className="recovery-help">
        Sirve para volver a entrar si se olvida la contraseña: en la pantalla de ingreso tocá "¿Olvidaste tu contraseña?".
        Guardalo en un lugar seguro, fuera de la computadora. Cada vez que se usa, se entrega uno nuevo.
      </div>
      <button className="btn btn-secondary btn-sm no-print mt-8" onClick={() => window.print()}>🖨️ Imprimir</button>
    </div>
  );
}

// Tarjeta de Configuración para generar un código nuevo (por ejemplo, si se perdió el papel).
export function RecoveryCodeCard({ status, onChanged }) {
  const [confirm, setConfirm] = useState(false);
  const [code, setCode] = useState(null);

  return (
    <div className="card narrow mt-20">
      <h3 className="card-title">Código de recuperación</h3>
      <p className="fs-13 text-muted mb-12">
        {status?.existe
          ? `Hay un código vigente, generado el ${dateTime(status.generado)}. Por seguridad no se puede volver a ver: si se perdió, generá uno nuevo.`
          : "Todavía no hay un código de recuperación. Generalo y guardalo en papel: sirve para entrar si te olvidás la contraseña."}
      </p>
      {code ? <RecoveryCodeBox code={code} /> : <button className="btn btn-secondary" onClick={() => setConfirm(true)}>Generar código nuevo</button>}
      {confirm && (
        <Confirm
          title="Generar código de recuperación"
          confirmLabel="Generar"
          message={<p>El código anterior (si había uno) deja de funcionar. El nuevo se muestra una sola vez.</p>}
          onConfirm={async () => {
            try {
              const r = await api.post("/settings/recuperacion");
              setCode(r.codigo);
              onChanged?.();
            } catch (e) {
              toast.error(e.message);
              throw e;
            }
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
