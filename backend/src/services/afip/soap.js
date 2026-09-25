const https = require("https");
const crypto = require("crypto");
const { XMLParser } = require("fast-xml-parser");

const modernAgent = new https.Agent({ keepAlive: true });
// Algunos servidores de AFIP usan parámetros TLS viejos que OpenSSL 3 rechaza por defecto.
const legacyAgent = new https.Agent({
  keepAlive: true,
  ciphers: "DEFAULT@SECLEVEL=1",
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

class AfipNetworkError extends Error {
  constructor(message) {
    super(message);
    this.network = true;
  }
}

const ARRAY_TAGS = new Set(["Err", "Obs", "Evt", "AlicIva", "FECAEDetResponse", "CbteAsoc", "PtoVenta"]);
const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => ARRAY_TAGS.has(name),
});

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

// { A: 1, B: [{C: 2}, {C: 3}] } -> <ar:A>1</ar:A><ar:B><ar:C>2</ar:C></ar:B><ar:B><ar:C>3</ar:C></ar:B>
function toXml(obj, prefix = "ar") {
  let out = "";
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      const inner = typeof v === "object" ? toXml(v, prefix) : escapeXml(v);
      out += `<${prefix}:${key}>${inner}</${prefix}:${key}>`;
    }
  }
  return out;
}

function post(url, body, soapAction, agent) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent,
        timeout: 45000,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: soapAction,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado")));
    req.on("error", reject);
    req.end(body);
  });
}

const isTlsError = (err) => /SSL|TLS|EPROTO|dh key|handshake/i.test(`${err.code} ${err.message}`);

async function call(url, envelope, soapAction) {
  let res;
  try {
    res = await post(url, envelope, soapAction, modernAgent);
  } catch (err) {
    if (!isTlsError(err)) throw new AfipNetworkError(`No se pudo conectar con ARCA: ${err.message}`);
    try {
      res = await post(url, envelope, soapAction, legacyAgent);
    } catch (err2) {
      throw new AfipNetworkError(`No se pudo conectar con ARCA: ${err2.message}`);
    }
  }

  let parsed;
  try {
    parsed = parser.parse(res.body);
  } catch {
    throw new AfipNetworkError(`Respuesta inválida de ARCA (HTTP ${res.status})`);
  }
  const body = parsed?.Envelope?.Body;
  if (!body) throw new AfipNetworkError(`Respuesta inesperada de ARCA (HTTP ${res.status})`);
  if (body.Fault) {
    const err = new Error(String(body.Fault.faultstring || "Error SOAP de ARCA"));
    err.soapFault = true;
    throw err;
  }
  return body;
}

module.exports = { call, toXml, escapeXml, parser, AfipNetworkError };
