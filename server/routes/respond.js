/** Errors with a `status` carry a user-facing message; anything else is a 500. */
export function sendError(res, next, error) {
  if (!error.status) {
    next(error);
    return;
  }
  if (error.status >= 500) console.error(error);
  res.status(error.status).json({ error: error.message });
}
