export const respond = (
  res,
  {
    statusCode = 200,
    message = "OK",
    data = null,
    error = null,
    success = null,
  } = {}
) => {
  const ok = success ?? (statusCode >= 200 && statusCode < 400 && !error);
  res.status(statusCode).json({ statusCode, message, data, error, success: ok });
};

export const ok = (res, data = null, message = "OK", statusCode = 200) =>
  respond(res, { statusCode, message, data, error: null, success: true });

export const created = (res, data = null, message = "Created") =>
  respond(res, { statusCode: 201, message, data, error: null, success: true });

export const fail = (
  res,
  {
    statusCode = 500,
    message = "Error",
    error = null,
    data = null,
  } = {}
) => {
  const errPayload =
    error && typeof error === "object"
      ? { message: error.message || String(error) }
      : error;
  respond(res, { statusCode, message, data, error: errPayload, success: false });
};

