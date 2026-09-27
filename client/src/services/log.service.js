/* eslint-disable no-console */
import ClientService from '@/services/client.service';

const write = (level, message, details) => {
    const print = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    print(`[peario] ${message}`, details || '');
    ClientService.log(level, message, details);
};

const LogService = {
    info: (message, details) => write('info', message, details),
    warn: (message, details) => write('warn', message, details),
    error: (message, details) => write('error', message, details),
};

export default LogService;
