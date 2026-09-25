const { call, toXml } = require("./soap");

const WSFE_URL = {
  homologacion: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  produccion: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};

class AfipError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.afipErrors = errors;
  }
}

const list = (x) => (x ? (Array.isArray(x) ? x : [x]) : []);
const formatMsgs = (arr) => list(arr).map((e) => `${e.Code}: ${e.Msg}`).join(" | ");

async function invoke(entorno, method, payload) {
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">` +
    `<soap:Body><ar:${method}>${toXml(payload)}</ar:${method}></soap:Body></soap:Envelope>`;
  const body = await call(WSFE_URL[entorno], envelope, `"http://ar.gov.afip.dif.FEV1/${method}"`);
  const result = body?.[`${method}Response`]?.[`${method}Result`];
  if (!result) throw new AfipError(`ARCA no devolvió resultado para ${method}`);
  return result;
}

const authBlock = (auth) => ({ Token: auth.token, Sign: auth.sign, Cuit: auth.cuit });

async function dummy(entorno) {
  return invoke(entorno, "FEDummy", {});
}

async function lastAuthorized(entorno, auth, ptoVta, cbteTipo) {
  const r = await invoke(entorno, "FECompUltimoAutorizado", { Auth: authBlock(auth), PtoVta: ptoVta, CbteTipo: cbteTipo });
  const errs = list(r.Errors?.Err);
  if (errs.length) throw new AfipError(formatMsgs(errs), errs);
  return Number(r.CbteNro || 0);
}

async function consult(entorno, auth, ptoVta, cbteTipo, cbteNro) {
  const r = await invoke(entorno, "FECompConsultar", {
    Auth: authBlock(auth),
    FeCompConsReq: { CbteTipo: cbteTipo, CbteNro: cbteNro, PtoVta: ptoVta },
  });
  const errs = list(r.Errors?.Err);
  // 602 = "No existen datos en nuestros registros para los parámetros ingresados".
  if (errs.some((e) => String(e.Code) === "602")) return null;
  if (errs.length) throw new AfipError(formatMsgs(errs), errs);
  return r.ResultGet || null;
}

const money = (n) => Number(n).toFixed(2);

/**
 * Solicita el CAE para un comprobante.
 * det: { tipo, ptoVta, numero, fecha(yyyymmdd), docTipo, docNro, condIvaReceptor, impTotal, impNeto, impIva, iva:[{id,base,importe}], asociado? }
 */
async function requestCae(entorno, auth, det) {
  const detalle = {
    Concepto: 1, // 1 = Productos
    DocTipo: det.docTipo,
    DocNro: det.docNro,
    CbteDesde: det.numero,
    CbteHasta: det.numero,
    CbteFch: det.fecha,
    ImpTotal: money(det.impTotal),
    ImpTotConc: "0.00",
    ImpNeto: money(det.impNeto),
    ImpOpEx: "0.00",
    ImpTrib: "0.00",
    ImpIVA: money(det.impIva),
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: det.condIvaReceptor,
  };
  if (det.asociado) {
    detalle.CbtesAsoc = {
      CbteAsoc: { Tipo: det.asociado.tipo, PtoVta: det.asociado.ptoVta, Nro: det.asociado.numero, Cuit: auth.cuit, CbteFch: det.asociado.fecha },
    };
  }
  if (det.iva?.length) {
    detalle.Iva = { AlicIva: det.iva.map((a) => ({ Id: a.id, BaseImp: money(a.base), Importe: money(a.importe) })) };
  }

  const r = await invoke(entorno, "FECAESolicitar", {
    Auth: authBlock(auth),
    FeCAEReq: {
      FeCabReq: { CantReg: 1, PtoVta: det.ptoVta, CbteTipo: det.tipo },
      FeDetReq: { FECAEDetRequest: detalle },
    },
  });

  const errs = list(r.Errors?.Err);
  const detResp = list(r.FeDetResp?.FECAEDetResponse)[0];
  const obs = list(detResp?.Observaciones?.Obs);
  const resultado = detResp?.Resultado || r.FeCabResp?.Resultado || "R";
  return {
    aprobado: resultado === "A" && !!detResp?.CAE,
    cae: detResp?.CAE || null,
    caeVto: detResp?.CAEFchVto || null,
    mensajes: [formatMsgs(errs), formatMsgs(obs)].filter(Boolean).join(" | "),
    errores: errs,
  };
}

module.exports = { WSFE_URL, AfipError, dummy, lastAuthorized, consult, requestCae };
