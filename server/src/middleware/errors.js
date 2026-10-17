export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);

  if (error.name === "ValidationError") {
    return res.status(400).json({ message: Object.values(error.errors).map((item) => item.message).join(" ") });
  }
  if (error.code === 11000) {
    return res.status(409).json({ message: "An account or employee with that email or ID already exists." });
  }
  if (error.name === "CastError") return res.status(400).json({ message: "Invalid record identifier." });

  res.status(error.status || 500).json({
    message: error.status ? error.message : "An unexpected server error occurred."
  });
}
