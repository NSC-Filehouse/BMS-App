const fs = require('fs');
const path = require('path');

// get ENV Parameters
const logIsOn = process.env.LOGGING === 'true';
const logToConsole = process.env.LOG_CONSOLE === 'true';
const logLevel = parseInt(process.env.LOG_LEVEL, 10) || 0;
const logFilePath = process.env.LOG_FILE_PATH && process.env.LOG_FILE_PATH !== '' ? process.env.LOG_FILE_PATH : path.join(__dirname, 'log.txt');
const logExpirationDays = parseInt(process.env.LOG_EXPIRATION_DAYS, 10) || 7;

// Log levels
const logLevels = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR',
  4: 'CRITICAL'
};

// Read log level from environment variable
const currentLogLevel = logLevel;

class Logger {
  constructor() {
    this.logIsOn = logIsOn;

    // Ensure log file exists
    if (!fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, '', 'utf8');
    }
  }

  formatMessage(level, ...messages) {
    const timestamp = new Date().toLocaleString();
    const logLevelStr = logLevels[level] || 'DEBUG';
    return `${timestamp} [${logLevelStr}] ${messages.join(' ')}\n`;
  }

  log(level, ...messages) {
    if (!this.logIsOn || level < currentLogLevel) return;
    const logMessage = this.formatMessage(level, ...messages);

    // Write to file
    fs.appendFile(logFilePath, logMessage, (err) => {
      if (err) throw err;
    });

    // Write to console if logToConsole is true
    if (logToConsole) {
      if (level >= 3) {
        console.error(logMessage.trim());
      } else {
        console.log(logMessage.trim());
      }
    }
  }

  debug(...messages) {
    this.log(0, ...messages);
  }

  info(...messages) {
    this.log(1, ...messages);
  }

  warning(...messages) {
    this.log(2, ...messages);
  }

  warn(...messages) {
    this.warning(...messages);
  }

  error(message, error) {
    const errorMessage = error instanceof Error ? error.message : error;
    this.log(3, `${message} - ${errorMessage}`);
  }

  critical(message, error) {
    const errorMessage = error instanceof Error ? error.message : error;
    this.log(4, `${message} - ${errorMessage}`);
  }

  setLogIsOn(value) {
    this.logIsOn = value;
  }

  cleanUpLogs() {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - logExpirationDays);
    const tempLogFilePath = logFilePath + '.tmp';

    fs.readFile(logFilePath, 'utf8', (err, data) => {
      if (err) throw err;

      const lines = data.split('\n');
      let keepEntry = false;
      const filteredLines = [];

      lines.forEach(line => {
        const dateMatch = line.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}), (\d{2}):(\d{2}):(\d{2})/);

        if (dateMatch) {
          const [day, month, year] = dateMatch.slice(1, 4).map(Number);
          const logDate = new Date(year, month - 1, day);
          if (logDate >= expirationDate) {
            keepEntry = true;
          }
        }

        if (keepEntry) {
          filteredLines.push(line);
        }
      });

      fs.writeFile(tempLogFilePath, filteredLines.join('\n'), (err) => {
        if (err) throw err;

        fs.rename(tempLogFilePath, logFilePath, (err) => {
          if (err) throw err;
        });
      });
    });
  }
}

module.exports = new Logger();
