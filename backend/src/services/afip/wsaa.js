const forge = require("node-forge");
const { call, parser } = require("./soap");

const WSAA_URL = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

function buildTra(service, now = new Date()) {
  const from = new Date(now.getTime() - 10 * 60 * 1000);
  const to = new Date(now.getTime() + 10 * 60 * 1000);
  return (
    `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>` +
    `<uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${from.toISOString()}</generationTime>` +
    `<expirationTime>${to.toISOString()}</expirationTime>` +
    `</header><service>${service}</service></loginTicketRequest>`
  );
}

// Firma el TRA en formato CMS (PKCS#7 SignedData) con el certificado y la clave del contribuyente.
function signTra(tra, certPem, keyPem) {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

// Datos del certificado para mostrarle al técnico si cargó el correcto y cuándo vence.
function inspectCertificate(certPem, keyPem) {
  let cert;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch {
    throw new Error("El certificado no es un archivo PEM válido (.crt)");
  }
  if (keyPem) {
    let key;
    try {
      key = forge.pki.privateKeyFromPem(keyPem);
    } catch {
      throw new Error("La clave privada no es un archivo PEM válido (.key). Si está encriptada, exportala sin contraseña.");
    }
    if (cert.publicKey.n.compareTo(key.n) !== 0) throw new Error("La clave privada no corresponde a este certificado");
  }
  const attr = (field, name) => field.getField(name)?.value || "";
  // El CUIT viaja en el campo serialNumber (OID 2.5.4.5) como "CUIT 20123456789".
  const serial = cert.subject.attributes.find((a) => a.type === "2.5.4.5")?.value || "";
  return {
    alias: attr(cert.subject, "CN"),
    cuit: (serial.match(/\d{11}/) || [""])[0],
    emisor: attr(cert.issuer, "CN"),
    validoDesde: cert.validity.notBefore.toISOString(),
    validoHasta: cert.validity.notAfter.toISOString(),
  };
}

async function loginCms({ entorno, service, certPem, keyPem }) {
  const cms = signTra(buildTra(service), certPem, keyPem);
  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;

  const body = await call(WSAA_URL[entorno], envelope, '""');
  const ticketXml = body?.loginCmsResponse?.loginCmsReturn;
  if (!ticketXml) throw new Error("ARCA no devolvió el ticket de acceso");
  const ticket = parser.parse(ticketXml)?.loginTicketResponse;
  const token = ticket?.credentials?.token;
  const sign = ticket?.credentials?.sign;
  const expira = ticket?.header?.expirationTime;
  if (!token || !sign || !expira) throw new Error("Ticket de acceso de ARCA incompleto");
  return { token, sign, expira: new Date(expira).toISOString() };
}

// Genera clave privada + solicitud de certificado (CSR) para subir a ARCA, sin necesitar OpenSSL.
function generateCsr({ cuit, razonSocial, alias }) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: razonSocial },
    { name: "commonName", value: alias },
    { type: "2.5.4.5", value: `CUIT ${cuit}` },
  ]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  return { csrPem: forge.pki.certificationRequestToPem(csr), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

module.exports = { generateCsr, loginCms, signTra, buildTra, inspectCertificate, WSAA_URL };
