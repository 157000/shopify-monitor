const silent = process.env.TGI_SILENT === '1';

function write(level, message) {
    if (silent) return;
    const line = `[${new Date().toISOString()}] ${level.padEnd(5)} ${message}`;
    if (level === 'ERROR' || level === 'WARN') console.error(line);
    else console.log(line);
}

export const log = {
    info: (message) => write('INFO', message),
    warn: (message) => write('WARN', message),
    error: (message) => write('ERROR', message),
};
