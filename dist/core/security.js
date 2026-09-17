import { MaintainerError } from './errors.js';
const blockedDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'vendor', '.venv', 'venv', 'target', '.next', '.codex-maintainer']);
const blockedNames = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\..*)?|id_(?:rsa|ed25519|ecdsa)|secrets?(?:\..*)?)$/i;
const blockedExtensions = /\.(?:pem|key|p12|pfx|crt|der|sqlite|db|png|jpe?g|gif|ico|webp|pdf|zip|gz|mp4|woff2?|ttf|map|lock)$/i;
export function isSafePath(path) {
    return path.length > 0 && path.length <= 500 && !path.startsWith('/') && !/[\\\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(path) && path.split('/').every((part) => part !== '..' && part !== '.' && part !== '');
}
export function includedPath(path, exclude = []) {
    if (!isSafePath(path))
        return false;
    const parts = path.split('/');
    if (parts.some((part) => blockedDirectories.has(part) || blockedNames.test(part)))
        return false;
    if (blockedExtensions.test(path) || /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|uv\.lock)$/i.test(path))
        return false;
    return !exclude.some((prefix) => { const normalized = prefix.replace(/\/$/, ''); return path === normalized || path.startsWith(`${normalized}/`); });
}
export function cleanText(text) {
    return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu, '');
}
export function redact(text, secrets = []) {
    let result = text;
    for (const secret of secrets)
        if (secret.length >= 4)
            result = result.split(secret).join('[REDACTED]');
    return cleanText(result)
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
        .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED TOKEN]')
        .replace(/\b(?:https?):\/\/[^\s/@:]+:[^\s/@]+@/gi, 'https://[REDACTED]@')
        .replace(/((?:api[_-]?key|secret|password|access[_-]?token|auth[_-]?token)\s*[=:]\s*)(["']?)[^\s"',;]{8,}\2/gi, '$1[REDACTED]');
}
/** Strip model-controlled Markdown features, HTML, mention notifications and terminal controls. */
export function safeMarkdown(text) {
    return redact(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/([\\`*_{}\[\]()#!|~])/g, '\\$1').replace(/@/g, '@\u200b');
}
export function positiveInteger(raw) {
    if (!/^[1-9]\d{0,8}$/.test(raw))
        throw new MaintainerError('CONFIG', 'Issue and PR numbers must be positive integers.');
    return Number(raw);
}
export function requireSecret(env, name) {
    const value = env[name]?.trim();
    if (!value)
        throw new MaintainerError('CONFIG', `${name} is required for live analysis. Set it in your environment; analyze (local) and demo do not need credentials.`);
    if (/[\r\n\x00]/.test(value))
        throw new MaintainerError('CONFIG', `${name} contains invalid characters.`);
    return value;
}
/** Sanitize every string in an already-validated JSON data object, including retained evidence. */
export function redactData(value, secrets = []) {
    const visit = (node) => {
        if (typeof node === 'string')
            return redact(node, secrets);
        if (Array.isArray(node))
            return node.map(visit);
        if (node !== null && typeof node === 'object')
            return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, visit(child)]));
        return node;
    };
    return visit(value);
}
/** Redact source text without moving original line coordinates. */
export function redactSource(text, secrets = []) {
    let privateKey = false;
    return text.split('\n').map((line) => {
        if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line))
            privateKey = true;
        const safe = privateKey ? '[REDACTED PRIVATE KEY]' : redact(line, secrets);
        if (/-----END [A-Z ]*PRIVATE KEY-----/.test(line))
            privateKey = false;
        return safe;
    }).join('\n');
}
//# sourceMappingURL=security.js.map