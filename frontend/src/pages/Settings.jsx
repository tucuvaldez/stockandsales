import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, download } from "../api";
import { useAuth } from "../auth";
import { Confirm, Field, Loader } from "../components/ui";
import { saveText } from "../lib/csv";
import { openFolder, printInFrame } from "../lib/print";
import { RecoveryCodeCard } from "../components/RecoveryCode";
import { date, dateTime, isValidCuit } from "../lib/format";

export default function Settings() {
  const { isBilling } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = [["negocio", "Negocio"], ...(isBilling ? [["fiscal", "Facturación ARCA"]] : []), ["impresion", "Impresión y PDF"], ["backups", "Copias de seguridad"]];
  const tab = tabs.some(([k]) => k === params.get("tab")) ? params.get("tab") : "negocio";

  return (
    <div>
      <div className="page-header"><div><h2 className="page-title">Configuración</h2></div></div>
      <div className="tabs">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setParams({ tab: k })}>{l}</button>)}
      </div>
      {tab === "negocio" && <NegocioTab />}
      {tab === "fiscal" && <FiscalTab />}
      {tab === "impresion" && <PrintTab />}
      {tab === "backups" && <BackupsTab />}
    </div>
  );
}

function NegocioTab() {
  const { negocio, reloadNegocio } = useAuth();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const loadRecovery = useCallback(() => api.get("/settings/recuperacion").then(setRecovery).catch(() => {}), []);
  useEffect(() => { loadRecovery(); }, [loadRecovery]);
  useEffect(() => {
    if (negocio) setF({ nombre: negocio.negocio_nombre, direccion: negocio.negocio_direccion, telefono: negocio.negocio_telefono, pieTicket: negocio.negocio_pie_ticket, cajaObligatoria: negocio.cajaObligatoria });
  }, [negocio]);
  if (!f) return <Loader />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.put("/settings/negocio", f); await reloadNegocio(); toast.success("Datos guardados"); } catch (err) { toast.error(err.message); }
    setBusy(false);
  };

  return (
    <>
    <form className="card narrow" onSubmit={submit}>
      <p className="text-muted fs-13 mb-12">Aparecen en el encabezado de los tickets.</p>
      <Field label="Nombre del negocio" required><input className="form-input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={100} /></Field>
      <Field label="Dirección"><input className="form-input" value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} maxLength={200} /></Field>
      <Field label="Teléfono"><input className="form-input" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} maxLength={50} /></Field>
      <Field label="Texto al pie del ticket" hint="Ej: ¡Gracias por su compra! Cambios dentro de los 30 días."><input className="form-input" value={f.pieTicket} onChange={(e) => setF({ ...f, pieTicket: e.target.value })} maxLength={300} /></Field>
      <label className="check mb-12">
        <input type="checkbox" checked={!!f.cajaObligatoria} onChange={(e) => setF({ ...f, cajaObligatoria: e.target.checked })} />
        Exigir caja abierta para vender (recomendado: así cada venta queda en un arqueo)
      </label>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button></div>
    </form>
    <RecoveryCodeCard status={recovery} onChanged={loadRecovery} />
    </>
  );
}

function FiscalTab() {
  const { reloadNegocio } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState("");
  const [test, setTest] = useState(null);
  const [confirmProd, setConfirmProd] = useState(false);

  const load = useCallback(async () => {
    const c = await api.get("/settings/fiscal");
    setCfg(c);
    setF({
      cuit: c.cuit, razonSocial: c.razonSocial, condicion: c.condicion, ptoVta: c.ptoVta || "", entorno: c.entorno,
      domicilio: c.domicilio, iibb: c.iibb, inicioActividades: c.inicioActividades, limiteConsumidorFinal: c.limiteConsumidorFinal,
    });
  }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);
  if (!f) return <Loader />;

  const save = async (data = f) => {
    setBusy("save");
    try {
      await api.put("/settings/fiscal", data);
      await Promise.all([load(), reloadNegocio()]);
      toast.success("Configuración fiscal guardada");
    } catch (err) { toast.error(err.message); }
    setBusy("");
  };

  const submit = (e) => {
    e.preventDefault();
    if (f.entorno === "produccion" && cfg.entorno !== "produccion") return setConfirmProd(true);
    save();
  };

  const genCsr = async () => {
    setBusy("csr");
    try {
      const r = await api.post("/settings/fiscal/csr", { alias: "stocklocal" });
      saveText(r.csr, `solicitud-${f.cuit}.csr`, "application/pkcs10");
      toast.success("Solicitud descargada. Subila a ARCA para obtener el certificado.");
      load();
    } catch (err) { toast.error(err.message); }
    setBusy("");
  };

  const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });

  const uploadCert = async (e) => {
    e.preventDefault();
    const form = e.target;
    const certFile = form.cert.files[0];
    if (!certFile) return toast.error("Elegí el archivo del certificado (.crt)");
    setBusy("cert");
    try {
      const cert = await readFile(certFile);
      const key = form.key?.files[0] ? await readFile(form.key.files[0]) : "";
      const info = await api.post("/settings/fiscal/certificado", { cert, key });
      toast.success(`Certificado cargado (vence ${date(info.validoHasta)})`);
      form.reset();
      await Promise.all([load(), reloadNegocio()]);
    } catch (err) { toast.error(err.message); }
    setBusy("");
  };

  const probar = async () => {
    setBusy("test");
    setTest(null);
    try { setTest({ ok: true, ...(await api.post("/settings/fiscal/probar")) }); } catch (err) { setTest({ ok: false, error: err.message }); }
    setBusy("");
  };

  const cuitOk = !f.cuit || isValidCuit(f.cuit);
  const cert = cfg.certificado;
  const venceProntoDias = cert ? Math.round((new Date(cert.validoHasta) - Date.now()) / 86400000) : null;

  return (
    <div className="grid-2 align-start">
      <form className="card" onSubmit={submit}>
        <h3 className="card-title">1. Datos del contribuyente</h3>
        <div className="form-row">
          <Field label="CUIT" required hint={!cuitOk ? "⚠️ CUIT inválido" : undefined}><input className="form-input mono" value={f.cuit} onChange={(e) => setF({ ...f, cuit: e.target.value.replace(/\D/g, "") })} maxLength={11} /></Field>
          <Field label="Punto de venta" required hint="Número habilitado para Web Services"><input className="form-input" type="number" min="1" value={f.ptoVta} onChange={(e) => setF({ ...f, ptoVta: e.target.value })} /></Field>
        </div>
        <Field label="Razón social" required><input className="form-input" value={f.razonSocial} onChange={(e) => setF({ ...f, razonSocial: e.target.value })} maxLength={120} /></Field>
        <Field label="Condición frente al IVA" required>
          <select className="form-select" value={f.condicion} onChange={(e) => setF({ ...f, condicion: e.target.value })}>
            <option value="MONO">Responsable Monotributo (emite Factura C)</option>
            <option value="RI">IVA Responsable Inscripto (emite Factura A y B)</option>
            <option value="EXENTO">IVA Sujeto Exento (emite Factura C)</option>
          </select>
        </Field>
        <Field label="Domicilio comercial"><input className="form-input" value={f.domicilio} onChange={(e) => setF({ ...f, domicilio: e.target.value })} maxLength={200} /></Field>
        <div className="form-row">
          <Field label="Ingresos Brutos"><input className="form-input" value={f.iibb} onChange={(e) => setF({ ...f, iibb: e.target.value })} maxLength={40} /></Field>
          <Field label="Inicio de actividades"><input className="form-input" type="date" value={f.inicioActividades} onChange={(e) => setF({ ...f, inicioActividades: e.target.value })} /></Field>
        </div>
        <Field label="Monto desde el cual hay que identificar al consumidor final" hint="Lo fija ARCA. Revisalo si cambia la normativa.">
          <input className="form-input" type="number" min="0" value={f.limiteConsumidorFinal} onChange={(e) => setF({ ...f, limiteConsumidorFinal: e.target.value })} />
        </Field>
        <div className="form-group">
          <span className="form-label">Entorno</span>
          <div className="segmented">
            <button type="button" className={f.entorno === "homologacion" ? "active" : ""} onClick={() => setF({ ...f, entorno: "homologacion" })}>🧪 Pruebas (homologación)</button>
            <button type="button" className={f.entorno === "produccion" ? "active danger" : ""} onClick={() => setF({ ...f, entorno: "produccion" })}>🏛️ Producción (real)</button>
          </div>
        </div>
        <div className="form-actions"><button className="btn btn-primary" disabled={busy === "save" || !cuitOk}>{busy === "save" ? "Guardando..." : "Guardar datos"}</button></div>
      </form>

      <div>
        <div className="card">
          <h3 className="card-title">2. Certificado digital</h3>
          {cert ? (
            <div className={`cert-box ${venceProntoDias < 30 ? "warn" : ""}`}>
              <div><strong>{cert.alias}</strong> · CUIT {cert.cuit}</div>
              <div className="fs-13">Emitido por {cert.emisor} · vence el <strong>{date(cert.validoHasta)}</strong>{venceProntoDias < 30 && ` (en ${venceProntoDias} días: renovalo)`}</div>
            </div>
          ) : (
            <p className="fs-13 text-muted">Todavía no hay certificado cargado.</p>
          )}

          <details className="guide" open={!cert}>
            <summary>¿Cómo obtengo el certificado?</summary>
            <ol className="steps">
              <li>Guardá los datos del paso 1 y tocá <button type="button" className="link-btn" onClick={genCsr} disabled={busy === "csr" || !cfg.cuit}>{busy === "csr" ? "generando..." : "Generar solicitud (.csr)"}</button>. La clave privada queda guardada acá, no hace falta OpenSSL.</li>
              {f.entorno === "homologacion" ? (
                <>
                  <li>Entrá a ARCA con clave fiscal y adherí el servicio <strong>"WSASS - Autogestión Certificados Homologación"</strong>.</li>
                  <li>En WSASS: <strong>Nuevo certificado</strong>, pegá el contenido del .csr y guardá el certificado que te devuelve como <em>.crt</em>.</li>
                  <li>En WSASS: <strong>Crear autorización a servicio</strong> para ese alias con el servicio <strong>wsfe</strong>.</li>
                </>
              ) : (
                <>
                  <li>En ARCA con clave fiscal: <strong>Administración de Certificados Digitales</strong> → agregá el alias y subí el .csr. Descargá el certificado (.crt).</li>
                  <li><strong>Administrador de Relaciones de Clave Fiscal</strong> → Nueva relación → ARCA → WebServices → <strong>Facturación Electrónica</strong>, eligiendo el alias como representante.</li>
                  <li><strong>Administración de puntos de venta y domicilios</strong>: creá un punto de venta del tipo <em>"Web Services"</em> y cargá ese número en el paso 1.</li>
                </>
              )}
              <li>Subí el .crt acá abajo y tocá <strong>Probar conexión</strong>.</li>
            </ol>
          </details>

          <form onSubmit={uploadCert} className="mt-12">
            <Field label="Certificado (.crt / .pem)"><input type="file" name="cert" accept=".crt,.pem,.cer,.txt" /></Field>
            {!cfg.csrPendiente && <Field label="Clave privada (.key)" hint="Solo si la generaste fuera de StockLocal"><input type="file" name="key" accept=".key,.pem,.txt" /></Field>}
            {cfg.csrPendiente && <p className="fs-12 text-muted mb-8">Se usará la clave de la solicitud generada acá.</p>}
            <button className="btn btn-secondary" disabled={busy === "cert"}>{busy === "cert" ? "Cargando..." : "Cargar certificado"}</button>
          </form>
        </div>

        <div className="card mt-20">
          <h3 className="card-title">3. Probar conexión con ARCA</h3>
          <button className="btn btn-primary" onClick={probar} disabled={busy === "test"}>{busy === "test" ? "Conectando..." : "Probar conexión"}</button>
          {test?.ok && (
            <div className="alert-banner alert-success mt-12">
              ✅ Conexión correcta ({test.entorno}). Último comprobante autorizado en el punto de venta: {test.ultimoComprobante}.
            </div>
          )}
          {test && !test.ok && <div className="alert-banner alert-danger mt-12">❌ {test.error}</div>}
        </div>
      </div>

      {confirmProd && (
        <Confirm
          title="Pasar a producción"
          danger
          confirmLabel="Sí, facturar en serio"
          message={<p>Desde ahora, cada factura se emite <strong>con validez fiscal real</strong> ante ARCA. Necesitás un certificado de producción (el de homologación no sirve). ¿Continuar?</p>}
          onConfirm={() => save()}
          onClose={() => setConfirmProd(false)}
        />
      )}
    </div>
  );
}

const Choice = ({ label, hint, value, options, onChange }) => (
  <div className="form-group">
    <span className="form-label">{label}</span>
    <div className="segmented">
      {options.map(([v, l]) => <button type="button" key={v} className={value === v ? "active" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
    {hint && <span className="form-hint">{hint}</span>}
  </div>
);

function PrintTab() {
  const { isBilling, reloadNegocio } = useAuth();
  const [f, setF] = useState(null);
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/settings/impresion").then(setF).catch((e) => toast.error(e.message));
    api.get("/documents").then(setDocs).catch(() => {});
  }, []);
  useEffect(load, [load]);
  if (!f) return <Loader />;
  const set = (k) => (v) => setF({ ...f, [k]: v });

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings/impresion", { ...f, impresion_directa: f.impresion_directa === "1" });
      await reloadNegocio();
      toast.success("Configuración guardada");
      load();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <div className="grid-2 align-start">
      <div className="card">
        <h3 className="card-title">Qué se imprime</h3>
        <Choice label="Cierre de caja" value={f.cierre_accion} onChange={set("cierre_accion")}
          options={[["pdf", "Solo guardar PDF"], ["pdf_imprimir", "PDF e imprimir"]]}
          hint="Si una sola persona atiende el negocio, con el PDF alcanza: queda archivado sin gastar papel." />
        <Choice label="Ticket de venta (no fiscal)" value={f.ticket_venta} onChange={set("ticket_venta")}
          options={[["no", "Nunca"], ["preguntar", "Botón para imprimir"], ["siempre", "Siempre"]]} />
        {isBilling && (
          <>
            <Choice label="Factura electrónica" value={f.factura_imprimir} onChange={set("factura_imprimir")}
              options={[["siempre", "Imprimir siempre"], ["preguntar", "Botón para imprimir"]]}
              hint="Siempre se guarda además una copia en PDF." />
            <Choice label="Formato de la factura impresa" value={f.factura_formato} onChange={set("factura_formato")}
              options={[["a4", "Hoja A4"], ["ticket", "Ticket 80 mm (impresora térmica)"]]} />
          </>
        )}
        <label className="check mt-8">
          <input type="checkbox" checked={f.impresion_directa === "1"} onChange={(e) => set("impresion_directa")(e.target.checked ? "1" : "0")} />
          Imprimir directo en la impresora predeterminada, sin mostrar la ventana de impresión
        </label>
        <p className="form-hint mt-8">
          Solo Windows. StockLocal se abre en una ventana propia de Edge o Chrome. Se aplica la próxima vez que se abra el sistema con el ícono StockLocal.
        </p>
        <div className="btn-row mt-12">
          <button className="btn btn-secondary" onClick={() => printInFrame("/imprimir/venta/0?prueba=1")}>🖨️ Imprimir página de prueba</button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Carpeta de documentos PDF</h3>
        <Field label="Carpeta" hint={`Por defecto: ${f.carpetaPorDefecto}`}>
          <input className="form-input mono fs-13" value={f.carpeta} onChange={(e) => setF({ ...f, carpeta: e.target.value })} />
        </Field>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar configuración"}</button>
          <button className="btn btn-secondary" onClick={() => openFolder().catch((e) => toast.error(e.message))}>📂 Abrir carpeta</button>
        </div>
        <p className="form-hint mt-8">Adentro se ordenan solos: <span className="mono">Cierres de caja\2026-09\</span>{isBilling && <>, <span className="mono">Facturas\2026-09\</span></>}</p>
        {docs?.archivos?.length > 0 && (
          <>
            <h4 className="section-title mt-20">Últimos documentos</h4>
            {docs.archivos.slice(0, 10).map((d) => (
              <div key={d.carpeta + d.nombre} className="row-between line fs-13">
                <span className="mono fs-12">{d.nombre}</span>
                <span className="text-muted fs-12 nowrap">{dateTime(d.fecha)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function BackupsTab() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/settings/backups").then(setList).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try { await api.post("/settings/backups"); toast.success("Copia creada"); load(); } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <div className="card narrow-lg">
      <p className="fs-13 text-muted mb-12">
        El sistema hace una copia automática por día (se guardan las últimas 30) en la carpeta <span className="mono">data\backups</span>.
        Recomendación: descargá una copia cada semana a un pendrive o a la nube. Para restaurar una copia usá <strong>RESTAURAR_COPIA.bat</strong>.
      </p>
      <button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? "Creando..." : "Crear copia ahora"}</button>
      {!list ? <Loader /> : (
        <table className="table-plain mt-12">
          <thead><tr><th>Fecha</th><th>Tamaño</th><th /></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.name}>
                <td>{dateTime(b.fecha)} <span className="text-muted fs-12">{b.name.includes("auto") ? "automática" : b.name.includes("manual") ? "manual" : ""}</span></td>
                <td className="fs-13">{(b.size / 1024 / 1024).toFixed(2)} MB</td>
                <td className="text-right"><button className="btn btn-sm btn-secondary" onClick={() => download(`/settings/backups/${b.name}`, null, b.name).catch((e) => toast.error(e.message))}>⬇️ Descargar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
