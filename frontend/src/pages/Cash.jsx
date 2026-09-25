import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, Field, Loader, Modal, Pagination } from "../components/ui";
import { PAYMENT_METHODS, dateTime, money, paymentLabel } from "../lib/format";
import { openFolder, openPdf, printInFrame } from "../lib/print";

const TIPOS = {
  venta: { label: "Venta", badge: "success" },
  devolucion: { label: "Devolución", badge: "warning" },
  anulacion: { label: "Anulación", badge: "danger" },
  ingreso: { label: "Ingreso", badge: "accent" },
  egreso: { label: "Egreso", badge: "danger" },
};
const openPrint = (id) => printInFrame(`/imprimir/caja/${id}`);
const viewPdf = (id) => openPdf(`/documents/caja/${id}.pdf`).catch((e) => toast.error(e.message));

export default function Cash() {
  const { can } = useAuth();
  const [state, setState] = useState(null);
  const [modal, setModal] = useState(null);
  const [closed, setClosed] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(() => api.get("/cash/actual").then(setState).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (!state) return <Loader />;
  const s = state.session;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Caja</h2>
          <p className="page-subtitle">{s ? `Abierta por ${s.abierta_por} · ${dateTime(s.abierta_at)}` : "La caja está cerrada"}</p>
        </div>
        {s && (
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => setModal("ingreso")}>+ Ingreso de dinero</button>
            <button className="btn btn-secondary" onClick={() => setModal("egreso")}>− Pago / gasto / retiro</button>
            <button className="btn btn-primary" onClick={() => setModal("cerrar")}>Cerrar caja</button>
          </div>
        )}
      </div>

      {!s ? <OpenForm obligatoria={state.obligatoria} onOpened={load} /> : <SessionView s={s} showExpected={can("admin", "supervisor")} />}

      {can("admin", "supervisor") && <History key={historyKey} />}

      {(modal === "ingreso" || modal === "egreso") && (
        <MovementModal tipo={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      )}
      {modal === "cerrar" && (
        <CloseModal
          session={s}
          showExpected={can("admin", "supervisor")}
          onClose={() => setModal(null)}
          onDone={(r) => { setModal(null); setClosed(r); load(); setHistoryKey((k) => k + 1); }}
        />
      )}
      {closed && <ClosedResult r={closed} onClose={() => setClosed(null)} />}
    </div>
  );
}

function OpenForm({ obligatoria, onOpened }) {
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/cash/abrir", { montoInicial: Number(monto) || 0, nota });
      toast.success("Caja abierta");
      onOpened();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h3 className="card-title">Abrir caja</h3>
      <p className="fs-13 text-muted mb-12">
        Contá el efectivo con el que arrancás (el cambio) y cargalo. {obligatoria && "No se puede vender con la caja cerrada."}
      </p>
      <Field label="Efectivo inicial" required>
        <input className="form-input input-money" type="number" min="0" step="0.01" autoFocus placeholder="0" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </Field>
      <Field label="Nota (opcional)"><input className="form-input" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} /></Field>
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? "Abriendo..." : "Abrir caja"}</button>
    </form>
  );
}

function SessionView({ s, showExpected }) {
  const medios = PAYMENT_METHODS.filter((m) => s.porMedio[m.value]);
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Vendido (neto)</div><div className="stat-value success">{money(s.totalNeto)}</div><div className="stat-meta">{s.cantidadVentas} venta(s)</div></div>
        <div className="stat-card"><div className="stat-label">Pagos, gastos e ingresos</div><div className={`stat-value ${s.otrosNeto < 0 ? "warning" : ""}`}>{money(s.otrosNeto)}</div><div className="stat-meta">no son ventas</div></div>
        <div className="stat-card"><div className="stat-label">Entró a la caja</div><div className="stat-value">{money(s.resultadoCaja)}</div><div className="stat-meta">vendido neto + otros movimientos</div></div>
        {showExpected && (
          <div className="stat-card"><div className="stat-label">Efectivo que debería haber</div><div className="stat-value accent">{money(s.efectivoEsperado)}</div><div className="stat-meta">inicial + movimientos en efectivo</div></div>
        )}
      </div>

      <div className="grid-2 align-start">
        <div className="card">
          <h3 className="card-title">Entró a la caja, por medio de pago</h3>
          <div className="row-between line fs-13 text-muted"><span>Efectivo inicial (cambio)</span><span>{money(s.monto_inicial)}</span></div>
          {medios.length === 0 ? <p className="fs-13 text-muted">Todavía no hay movimientos</p> : medios.map((m) => (
            <div key={m.value} className="row-between line"><span>{m.icon} {m.label}</span><strong>{money(s.porMedio[m.value])}</strong></div>
          ))}
          <p className="fs-12 text-muted mt-8">Ventas menos devoluciones, más ingresos, menos pagos y retiros. Solo el efectivo se cuenta al cerrar.</p>
        </div>
        <div className="card">
          <h3 className="card-title">Movimientos de dinero</h3>
          {s.entries.length === 0 ? <p className="fs-13 text-muted">Sin movimientos</p> : (
            <div className="cash-entries">
              {[...s.entries].reverse().map((e) => (
                <div key={e.id} className="row-between line fs-13">
                  <span>
                    <Badge kind={TIPOS[e.tipo]?.badge}>{TIPOS[e.tipo]?.label}</Badge> {e.motivo}
                    <div className="text-muted fs-12">{dateTime(e.fecha)} · {paymentLabel(e.metodo_pago)} · {e.usuario_nombre}</div>
                  </span>
                  <strong className={e.monto < 0 ? "text-danger" : "text-success"}>{e.monto < 0 ? "−" : "+"}{money(Math.abs(e.monto))}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MovementModal({ tipo, onClose, onDone }) {
  const [f, setF] = useState({ monto: "", motivo: "", metodoPago: "efectivo" });
  const [busy, setBusy] = useState(false);
  const egreso = tipo === "egreso";

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/cash/movimiento", { ...f, tipo, monto: Number(f.monto) });
      toast.success(egreso ? "Egreso registrado" : "Ingreso registrado");
      onDone();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={egreso ? "Pago, gasto o retiro" : "Ingreso de dinero"} onClose={onClose} width={440}>
      <form onSubmit={submit}>
        <Field label="Monto" required><input className="form-input input-money" type="number" min="0.01" step="0.01" autoFocus value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></Field>
        <Field label="Motivo" required>
          <input className="form-input" list="motivos" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} maxLength={200}
            placeholder={egreso ? "Ej: pago a proveedor, compra de bolsas, retiro del dueño" : "Ej: cambio, aporte del dueño"} />
          <datalist id="motivos">
            {(egreso ? ["Pago a proveedor", "Compra de insumos", "Retiro del dueño", "Gastos varios", "Flete"] : ["Cambio", "Aporte del dueño", "Cobro de deuda"]).map((m) => <option key={m} value={m} />)}
          </datalist>
        </Field>
        <div className="form-group">
          <span className="form-label">{egreso ? "¿Cómo se pagó?" : "¿Cómo ingresó?"}</span>
          <div className="segmented">
            {PAYMENT_METHODS.filter((m) => ["efectivo", "transferencia", "debito", "qr"].includes(m.value)).map((m) => (
              <button type="button" key={m.value} className={f.metodoPago === m.value ? "active" : ""} onClick={() => setF({ ...f, metodoPago: m.value })}>{m.label}</button>
            ))}
          </div>
          <span className="form-hint">{f.metodoPago === "efectivo" ? "Afecta el efectivo de la caja." : "Queda registrado, pero no cambia el efectivo de la caja."}</span>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !f.monto || !f.motivo.trim()}>{busy ? "Guardando..." : "Registrar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CloseModal({ session, showExpected, onClose, onDone }) {
  const [contado, setContado] = useState("");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = showExpected && contado !== "" ? Number(contado) - session.efectivoEsperado : null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await api.post("/cash/cerrar", { efectivoContado: Number(contado), nota }));
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Cerrar caja" onClose={onClose} width={440} closeOnOverlay={false}>
      <form onSubmit={submit}>
        <p className="fs-13 text-muted mb-12">Contá todo el efectivo que hay en la caja (incluido el cambio inicial) y cargalo.</p>
        <Field label="Efectivo contado" required>
          <input className="form-input input-money" type="number" min="0" step="0.01" autoFocus value={contado} onChange={(e) => setContado(e.target.value)} />
        </Field>
        {diff !== null && (
          <div className={`stock-preview ${Math.abs(diff) >= 0.01 ? "bad" : ""}`}>
            Esperado {money(session.efectivoEsperado)} · Diferencia <strong>{diff >= 0 ? "+" : "−"}{money(Math.abs(diff))}</strong>
          </div>
        )}
        <Field label="Observaciones" className="mt-12"><input className="form-input" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ej: faltante por error de vuelto" /></Field>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || contado === ""}>{busy ? "Cerrando..." : "Cerrar caja"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ClosedResult({ r, onClose }) {
  const { negocio, can } = useAuth();
  const ok = Math.abs(r.diferencia) < 0.01;
  const imprimir = negocio?.impresion?.cierre_accion === "pdf_imprimir";
  useEffect(() => { if (imprimir) openPrint(r.id); }, [imprimir, r.id]);

  return (
    <Modal
      title="Caja cerrada"
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => viewPdf(r.id)}>📄 Ver PDF</button>
          {!imprimir && <button className="btn btn-secondary" onClick={() => openPrint(r.id)}>🖨️ Imprimir</button>}
          <button className="btn btn-primary" onClick={onClose}>Listo</button>
        </>
      }
    >
      <div className="row-between line"><span>Efectivo esperado</span><strong>{money(r.efectivo_esperado)}</strong></div>
      <div className="row-between line"><span>Efectivo contado</span><strong>{money(r.efectivo_contado)}</strong></div>
      <div className={`alert-banner mt-12 ${ok ? "alert-success" : r.diferencia > 0 ? "alert-info" : "alert-danger"}`}>
        {ok ? "✅ La caja cierra justa." : r.diferencia > 0 ? `Sobrante de ${money(r.diferencia)}` : `Faltante de ${money(-r.diferencia)}`}
      </div>
      {r.pdf?.ok ? (
        <p className="fs-13 text-muted">
          📄 Cierre guardado en PDF: <span className="mono fs-12 path">{r.pdf.archivo}</span>
          {can("admin", "supervisor") && <> · <button className="link-btn" onClick={() => openFolder().catch((e) => toast.error(e.message))}>abrir carpeta</button></>}
        </p>
      ) : r.pdf && <div className="alert-banner alert-warning">No se pudo guardar el PDF: {r.pdf.error}. Podés generarlo con "Ver PDF".</div>}
    </Modal>
  );
}

function History() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/cash", { page }).then(setData).catch((e) => toast.error(e.message)); }, [page]);
  if (!data) return null;

  return (
    <div className="mt-20">
      <h3 className="card-title">Cajas anteriores</h3>
      {data.sessions.length === 0 ? <Empty icon="💵" title="Todavía no hay cajas" /> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Apertura</th><th>Cierre</th><th className="text-right">Vendido</th><th className="text-right">Diferencia</th><th /></tr></thead>
              <tbody>
                {data.sessions.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.id}</td>
                    <td className="fs-13">{dateTime(c.abierta_at)}<div className="text-muted">{c.abierta_por}</div></td>
                    <td className="fs-13">{c.estado === "abierta" ? <Badge kind="success">Abierta</Badge> : <>{dateTime(c.cerrada_at)}<div className="text-muted">{c.cerrada_por}</div></>}</td>
                    <td className="text-right fw-600">{money(c.totalNeto)}</td>
                    <td className="text-right">
                      {c.estado === "cerrada" && (Math.abs(c.diferencia) < 0.01 ? <Badge kind="success">Justa</Badge> : <Badge kind={c.diferencia > 0 ? "warning" : "danger"}>{c.diferencia > 0 ? "+" : "−"}{money(Math.abs(c.diferencia))}</Badge>)}
                    </td>
                    <td className="text-right nowrap">{c.estado === "cerrada" && <><button className="btn btn-sm btn-secondary" onClick={() => viewPdf(c.id)}>📄 PDF</button> <button className="btn btn-sm btn-ghost" title="Imprimir" onClick={() => openPrint(c.id)}>🖨️</button></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
