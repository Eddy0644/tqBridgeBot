const log4js = require('log4js');
const logger_pattern = "[%d{hh:mm:ss.SSS}] %3.3c:[%5.5p] %m";
const logger_pattern_console = "[%d{yy/MM/dd hh:mm:ss}] %[%3.3c:[%5.5p]%] %m";
log4js.configure({
    appenders: {
        "console": {
            type: "console",
            layout: {
                type: "pattern",
                pattern: logger_pattern_console
            },
        },
        "dateLog": {
            type: "dateFile",
            filename: "log/day",
            pattern: "yy-MM-dd.log",
            alwaysIncludePattern: true,
            layout: {
                type: "pattern",
                pattern: logger_pattern
            },
        },
        "debug_to_con": {
            type: "logLevelFilter",
            appender: "console",
            level: "debug",
        }
    },
    categories: {
        "default": {appenders: ["dateLog"], level: "trace"},
        "con": {appenders: ["console"], level: "debug"},
        "tq": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
        "qq": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
        "tg": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
    }
});
module.exports = (param) => {
    if (param === "startup") log4js.getLogger("default").trace(`Program Starting...
   __        __          __ 
  / /_____ _/ /_  ____  / /_
 / __/ __ \`/ __ \\/ __ \\/ __/
/ /_/ /_/ / /_/ / /_/ / /_  
\\__/\\__, /_.___/\\____/\\__/  
      /_/                                                         
`);
    return {
        qqLogger: log4js.getLogger("qq"),
        tgLogger: log4js.getLogger("tg"),
        defLogger: log4js.getLogger("tq"),
    };
};