const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function errorHandler(err, req, res, next) {
  logger.error({ err, reqId: req.id, url: req.originalUrl }, 'Unhandled error');
  
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
}

module.exports = errorHandler;
