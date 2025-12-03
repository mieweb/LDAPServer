const winston = require('winston');

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    security: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    security: 'magenta',
  },
};

// Logger configured for systemd compatibility
// Logs to stdout only - systemd journald captures and manages logs
const logger = winston.createLogger({
  levels: customLevels.levels,
  transports: [
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || "info",
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

logger.securityEvent = function (message, meta) {
  this.log('security', message, meta);
};

module.exports = logger;
