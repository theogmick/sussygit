"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogHooks = exports.LogMeta = exports.LogLevel = exports.LoggrConfig = exports.ColorConfig = void 0;
const chalk_1 = require("chalk");
const dayjs = require("dayjs");
const util = require("util");
class ColorConfig {
    constructor() {
        this.text = chalk_1.default.white;
        this.number = chalk_1.default.cyan;
        this.error = chalk_1.default.red;
    }
}
exports.ColorConfig = ColorConfig;
class LoggrConfig {
    constructor({ shardId, shardLength, level, levels, meta, stdout, stderr, timestampFormat, colors }) {
        this.shardId = shardId;
        this.shardLength = shardLength;
        this.level = level;
        this.levels = levels;
        this.meta = meta;
        this.stdout = stdout;
        this.stderr = stderr;
        this.timestampFormat = timestampFormat;
        this.colors = colors || new ColorConfig();
    }
}
exports.LoggrConfig = LoggrConfig;
class LogLevel {
    constructor(name, color) {
        this.err = false;
        this.trace = false;
        this.aliases = [];
        this.name = name;
        this.color = color;
    }
    setError(err = true) {
        this.err = err;
        if (!this.colors) {
            this.colors = {
                text: chalk_1.default.red,
                number: chalk_1.default.red
            };
        }
        return this;
    }
    setTrace(trace = true) {
        this.trace = trace;
        return this;
    }
    setAliases(...aliases) {
        this.aliases = aliases;
        return this;
    }
    setColors(colors) {
        this.colors = colors;
        return this;
    }
}
exports.LogLevel = LogLevel;
/**
 * @typedef {Object} LogMeta
 * @property {number} [metaObject.depth=1] The depth of objects to inspect
 * @property {boolean} [metaObject.color=true] Whether to display colors
 * @property {boolean} [metaObject.trace=false] Whether to generate a stacktrace
 */
class LogMeta {
    constructor({ depth = 1, color = true, trace = false, shardId = '', quote = false, context = {} }) {
        this.depth = 1;
        this.color = true;
        this.trace = false;
        this.shardId = '';
        this.quote = false;
        this.context = {};
        this.depth = depth;
        this.color = color;
        this.trace = trace;
        this.shardId = shardId;
        this.quote = quote;
        this.context = context;
    }
}
exports.LogMeta = LogMeta;
class LogHooks {
    constructor() {
        this.pre = [];
        this.arg = [];
        this.post = [];
    }
}
exports.LogHooks = LogHooks;
/**
 * Class containing logging functionality
 */
class CatLoggr {
    /**
     * Creates an instance of the logger.
     * @param {LoggrConfig} [options] Configuration options
     * @param {string|number} [options.shardId] The shard ID that the logger is on
     * @param {string|number} [options.shardLength=4] The maximum number of characters that a shard can be
     * @param {string} [options.level=info] The default log threshold
     * @param {level[]} [options.levels] Custom level definitions
     * @param {metaObject} [options.meta] The default meta configuration
     * @param {WriteStream} [options.stdout] The output stream to use for general logs
     * @param {WriteStream} [options.stderr] The output stream to use for error logs
     */
    constructor(config) {
        if (!config)
            config = new LoggrConfig({});
        if (!(config instanceof LoggrConfig))
            config = new LoggrConfig(config);
        this._config = config;
        if (config.shardId) {
            this._shard = config.shardId;
            this._shardLength = config.shardLength;
            // if (typeof this._shard === 'number' && this._shard < 10) this._shard = '0' + this._shard;
        }
        this._stdout = config.stdout || process.stdout;
        this._stderr = config.stderr || process.stderr;
        this.setLevels(config.levels || CatLoggr.DefaultLevels);
        this.setLevel(config.level || this._levels[this._levels.length - 1].name);
        this.setDefaultMeta(config.meta || {});
        this._meta = {};
        this._hooks = new LogHooks();
    }
    static get DefaultLevels() {
        return [
            new LogLevel('fatal', chalk_1.default.red.bgBlack).setError(),
            new LogLevel('error', chalk_1.default.black.bgRed).setError(),
            new LogLevel('warn', chalk_1.default.black.bgYellow).setError(),
            new LogLevel('trace', chalk_1.default.green.bgBlack).setTrace(),
            new LogLevel('init', chalk_1.default.black.bgBlue),
            new LogLevel('info', chalk_1.default.black.bgGreen),
            new LogLevel('verbose', chalk_1.default.black.bgCyan),
            new LogLevel('debug', chalk_1.default.magenta.bgBlack).setAliases('log', 'dir')
        ];
    }
    /**
     * A helper reference to the chalk library
     */
    static get _chalk() {
        return chalk_1.default;
    }
    /**
     * Adds a pre-hook
     * @param {ArgHookCallback} func The hook callback
     * @returns {CatLoggr} Self for chaining
     */
    addPreHook(func) {
        this._hooks.pre.push(func);
        return this;
    }
    /**
     * Adds an arg-hook
     * @param {ArgHookCallback} func The hook callback
     * @returns {CatLoggr} Self for chaining
     */
    addArgHook(func) {
        this._hooks.arg.push(func);
        return this;
    }
    /**
     * Adds a post-hook
     * @param {PostHookCallback} func
     * @returns {CatLoggr} Self for chaining
     */
    addPostHook(func) {
        this._hooks.post.push(func);
        return this;
    }
    /**
     * Sets the default meta object to use for all logs.
     * @param {metaObject?} meta The default meta object to use
     * @returns {CatLoggr?} Self for chaining
     */
    setDefaultMeta(meta) {
        if (typeof meta !== 'object')
            throw new TypeError('meta must be an object');
        this._defaultMeta = new LogMeta(meta);
        return this;
    }
    /**
     * Sets the level threshold. Only logs on and above the threshold will be output.
     * @param {string} level The level threshold
     * @returns {CatLoggr} Self for chaining
     */
    setLevel(level) {
        if (typeof level !== 'string')
            throw new TypeError('level must be a string');
        if (!this._levelMap[level])
            throw new Error(`the level '${level}' does not exist`);
        this._levelName = level;
        return this;
    }
    /**
     * @typedef level
     * @property {string} level.name The name of the level
     * @property {Object} level.color The color of the level (using chalk)
     * @property {string[]} level.aliases The alternate names that can be used to invoke the level
     * @property {boolean} level.err A flag signifying that the level writes to stderr
     * @property {boolean} level.trace A flag signifying that the level should generate a stacktrace
     */
    /**
     * Overwrites the currently set levels with a custom set.
     * @param {level[]} levels An array of levels, in order from high priority to low priority
     * @returns {CatLoggr} Self for chaining
     */
    setLevels(levels) {
        if (!Array.isArray(levels))
            throw new TypeError('levels must be an array.');
        this._levelMap = {};
        this._levels = levels;
        let max = 0;
        this._levels = this._levels.map(l => {
            l.position = this._levels.indexOf(l);
            this._levelMap[l.name] = l;
            let func = function (...args) {
                return this._format(l, ...args);
            }.bind(this);
            this[l.name] = func;
            if (l.aliases && Array.isArray(l.aliases))
                for (const alias of l.aliases)
                    this[alias] = func;
            max = l.name.length > max ? l.name.length : max;
            return l;
        });
        if (!this._levelMap[this._levelName])
            this._levelName = this._levels[this._levels.length - 1].name;
        this._maxLength = max + 2;
        return this;
    }
    /**
     * Registers CatLoggr as the global `console` property.
     * @returns {CatLoggr} Self for chaining
     */
    setGlobal() {
        Object.defineProperty.bind(this)(global, 'console', {
            get: () => {
                return this;
            }
        });
        return this;
    }
    get _level() {
        return this._levelMap[this._levelName];
    }
    get _timestamp() {
        let ts = dayjs();
        let formatted = ts.format(this._config.timestampFormat || 'MM/DD HH:mm:ss');
        return {
            raw: ts.toDate(),
            formatted: chalk_1.default.black.bgWhite(` ${formatted} `),
            formattedRaw: formatted
        };
    }
    /**
     * Center aligns text.
     * @param {string} text The text to align
     * @param {number} length The length that it should be padded to
     * @returns {string} The padded text
     */
    _centrePad(text, length) {
        if (text.length < length)
            return ' '.repeat(Math.floor((length - text.length) / 2))
                + text + ' '.repeat(Math.ceil((length - text.length) / 2));
        else
            return text;
    }
    /**
     * Writes the log to the proper stream.
     * @param {Level} level The level of the log
     * @param {string} text The text to write
     * @param {boolean} err A flag signifying whether to write to stderr
     * @param {Object} [timestamp] An optional timestamp to use
     * @param {string} timestamp.formatted The formatted timestamp
     * @param {Date} timestamp.raw The raw timestamp
     * @returns {CatLoggr} Self for chaining
     */
    _write(level, text, err = false, timestamp) {
        if (!timestamp)
            timestamp = this._timestamp;
        let levelStr = level.color(this._centrePad(level.name, this._maxLength));
        let stream = err ? this._stderr : this._stdout;
        let shardText = '';
        if (this._shard)
            shardText = chalk_1.default.black.bold.bgYellow(this._centrePad(this._meta.shardId ? this._meta.shardId.toString() : this._shard.toString(), this._shardLength));
        for (const hook of this._hooks.post) {
            if (typeof hook == 'function') {
                let res = hook({
                    text,
                    date: timestamp.raw,
                    timestamp: timestamp.formattedRaw,
                    shard: this._shard ? this._shard.toString() : undefined,
                    level: level.name,
                    error: level.err,
                    context: this._meta.context,
                    meta: this._meta
                });
                if (res === undefined || res === null)
                    continue;
                else {
                    text = res.toString();
                }
                break;
            }
        }
        stream.write(`${shardText}${timestamp.formatted}${levelStr} ${text}\n`);
        this._meta = {};
        return this;
    }
    /**
     * Sets the meta for the next log.
     * @param {metaObject} meta - The meta object to set
     * @returns {CatLoggr} Self for chaining
     */
    meta(meta = {}) {
        let temp = {};
        Object.assign(temp, this._defaultMeta, meta);
        this._meta = temp;
        return this;
    }
    /**
     * Formats logs in preparation for writing.
     * @param {string} level The level of the log
     * @param {*} args The args that were directly passed to the function
     * @returns {CatLoggr} Self for chaining
     */
    _format(level, ...args) {
        let timestamp = this._timestamp;
        if (level.position > this._level.position)
            return;
        let output = '';
        let text = [];
        let colors = this._config.colors;
        if (level.colors) {
            colors = Object.assign({}, colors, level.colors);
        }
        if (typeof args[0] === 'string') {
            let formats = args[0].match(/%[sdifjoO]/g);
            if (formats) {
                let a = args.splice(1, formats.length);
                args.unshift(util.format(args.shift(), ...a));
            }
        }
        for (const hook of this._hooks.pre) {
            let res = hook({
                args,
                date: timestamp.raw,
                timestamp: timestamp.formattedRaw,
                shard: this._shard ? this._shard.toString() : undefined,
                level: level.name,
                error: level.err,
                context: this._meta.context,
                meta: this._meta
            });
        }
        for (const arg of args) {
            let finished = false;
            for (const hook of this._hooks.arg) {
                if (typeof hook == 'function') {
                    let res = hook({ arg, date: timestamp.raw });
                    if (res === undefined || res === null)
                        continue;
                    else if (Array.isArray(res)) {
                        text.push(...res);
                    }
                    else {
                        text.push(res);
                    }
                    finished = true;
                    break;
                }
            }
            if (finished)
                continue;
            if (typeof arg === 'string') {
                text.push(colors.text(this._meta.quote ? `'${arg}'` : arg));
            }
            else if (typeof arg === 'number') {
                text.push(colors.number(arg.toString()));
            }
            else if (typeof arg === 'object') {
                text.push('\n');
                if (arg instanceof Error) {
                    text.push(colors.error(arg.stack));
                }
                else {
                    text.push(util.inspect(arg, this._meta));
                }
            }
            else
                text.push(arg);
        }
        output += text.join(' ');
        if (level.trace || this._meta.trace) {
            output += '\n' + new Error().stack.split('\n').slice(1).join('\n');
        }
        if (level.err)
            output = chalk_1.default.red(output);
        return this._write(level, output, level.err).meta();
    }
}
exports.default = CatLoggr;
;
//# sourceMappingURL=Loggr.js.map