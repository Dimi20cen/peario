import fs from 'fs';
import path from 'path';
import { LOG_FILE, LOG_MAX_BYTES, LOG_FILES } from './config';

type Level = 'INFO' | 'WARN' | 'ERROR';
type Details = Record<string, unknown>;

interface Context {
    room?: string;
    user?: string;
}

// Stream links carry debrid API keys and tokens, so only ever log a URL's host and file name.
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi;

const describeUrl = (url: string) => {
    try {
        const { protocol, host, pathname } = new URL(url);
        const file = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
        return `${protocol}//${host}/…${file ? `/${file}` : ''}`;
    } catch {
        return '<url>';
    }
};

const redact = (text: string) => text.replace(URL_PATTERN, describeUrl);

const format = (value: unknown) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return redact(text === undefined ? String(value) : text);
};

let fileBytes = 0;
if (LOG_FILE) {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fileBytes = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;
}

const rotate = () => {
    for (let i = LOG_FILES - 1; i >= 1; i--) {
        const from = i === 1 ? LOG_FILE : `${LOG_FILE}.${i - 1}`;
        if (fs.existsSync(from)) fs.renameSync(from, `${LOG_FILE}.${i}`);
    }
    fileBytes = 0;
};

const writeToFile = (line: string) => {
    if (!LOG_FILE) return;
    try {
        if (fileBytes + line.length > LOG_MAX_BYTES) rotate();
        fs.appendFileSync(LOG_FILE, line);
        fileBytes += Buffer.byteLength(line);
    } catch (error) {
        console.error('Failed to write log file:', error);
    }
};

const write = (level: Level, context: Context, message: string, details: Details = {}) => {
    const tags = [context.room && `room=${context.room}`, context.user && `user=${context.user}`].filter(Boolean).join(' ');
    const fields = Object.entries(details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${format(value)}`)
        .join(' ');

    const line = `${new Date().toISOString()} ${level.padEnd(5)} ${tags ? `[${tags}] ` : ''}${redact(message)}${fields ? ` ${fields}` : ''}\n`;
    (level === 'INFO' ? process.stdout : process.stderr).write(line);
    writeToFile(line);
};

const logger = {
    info: (context: Context, message: string, details?: Details) => write('INFO', context, message, details),
    warn: (context: Context, message: string, details?: Details) => write('WARN', context, message, details),
    error: (context: Context, message: string, details?: Details) => write('ERROR', context, message, details),
};

export { logger, describeUrl };
