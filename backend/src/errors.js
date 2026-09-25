class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const badRequest = (message, extra) => new HttpError(400, message, extra);
const notFound = (message = "No encontrado") => new HttpError(404, message);
const forbidden = (message = "No tenés permisos para esta acción") => new HttpError(403, message);
const conflict = (message, extra) => new HttpError(409, message, extra);

module.exports = { HttpError, badRequest, notFound, forbidden, conflict };
