const winston = require('winston');
const path = require("path");

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

// Create logs directory if it doesn't exist
const fs = require("fs");
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  levels: customLevels.levels,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: path.join(logDir, "error.log"), level: "error" }),
    new winston.transports.File({ filename: path.join(logDir, "combined.log") }),
  ],
});

logger.securityEvent = function (message, meta) {
  this.log('security', message, meta);
};

module.exports = logger;
