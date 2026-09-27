import { config } from 'dotenv';

config({ quiet: true });

export const PORT = process.env.PORT as unknown as number;
export const PEM_CERT = process.env.PEM_CERT as unknown as string;
export const PEM_KEY = process.env.PEM_KEY as unknown as string;
export const INTERVAL_CLIENT_CHECK = process.env.INTERVAL_CLIENT_CHECK as unknown as number;
export const INTERVAL_ROOM_UPDATE = process.env.INTERVAL_ROOM_UPDATE as unknown as number;
export const LOG_FILE = process.env.LOG_FILE || '';
export const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES) || 5 * 1024 * 1024;
export const LOG_FILES = Number(process.env.LOG_FILES) || 3;