/**
 * Solidity syntax highlighter using the d_tuft design system.
 *
 * Tokenizes a line of Solidity-like code and returns it with ANSI colors
 * applied via the T.code theme tokens.
 */
import { T } from '../cli/ui/theme';

const KEYWORDS = new Set([
    'pragma', 'solidity', 'contract', 'interface', 'library', 'abstract',
    'function', 'modifier', 'event', 'error', 'struct', 'enum',
    'return', 'returns', 'if', 'else', 'for', 'while', 'do',
    'break', 'continue', 'new', 'delete', 'emit', 'assembly',
    'using', 'import', 'from', 'is', 'override', 'virtual',
    'immutable', 'constant', 'indexed', 'anonymous', 'unbounded',
    'mapping', 'memory', 'storage', 'calldata',
]);

const VISIBILITY = new Set(['public', 'private', 'internal', 'external']);
const MUTABILITY = new Set(['view', 'pure', 'payable', 'nonpayable']);
const BUILTINS = new Set([
    'require', 'revert', 'assert', 'selfdestruct',
    'msg', 'block', 'tx', 'abi', 'address',
]);

const TYPES = new Set([
    'uint256', 'uint128', 'uint64', 'uint32', 'uint16', 'uint8',
    'int256', 'int128', 'int64', 'int32', 'int16', 'int8',
    'address', 'bool', 'string', 'bytes', 'bytes32', 'bytes4',
    'bytes20', 'uint', 'int',
]);

export function highlightSolidityLine(line: string): string {
    let result = '';
    let i = 0;

    while (i < line.length) {
        // ── Comments ──────────────────────────────────────────────────────────
        if (line[i] === '/' && line[i + 1] === '/') {
            result += T.code.comment(line.slice(i));
            break;
        }

        if (line[i] === '/' && line[i + 1] === '*') {
            const end = line.indexOf('*/', i + 2);
            if (end === -1) {
                result += T.code.comment(line.slice(i));
                break;
            }
            result += T.code.comment(line.slice(i, end + 2));
            i = end + 2;
            continue;
        }

        // ── Strings ───────────────────────────────────────────────────────────
        if (line[i] === '"' || line[i] === "'") {
            const quote = line[i];
            let j = i + 1;
            while (j < line.length && line[j] !== quote) {
                if (line[j] === '\\') j++;
                j++;
            }
            result += T.code.string(line.slice(i, j + 1));
            i = j + 1;
            continue;
        }

        // ── Hex selectors (0x...) ────────────────────────────────────────────
        if (line[i] === '0' && line[i + 1] === 'x') {
            let j = i + 2;
            while (j < line.length && /[0-9a-fA-F]/.test(line[j]!)) j++;
            result += T.code.selector(line.slice(i, j));
            i = j;
            continue;
        }

        // ── Numbers ───────────────────────────────────────────────────────────
        if (/[0-9]/.test(line[i]!) && (i === 0 || !/[a-zA-Z_]/.test(line[i - 1]!))) {
            let j = i;
            while (j < line.length && /[0-9]/.test(line[j]!)) j++;
            result += T.code.number(line.slice(i, j));
            i = j;
            continue;
        }

        // ── Identifiers / keywords / types ────────────────────────────────────
        if (/[a-zA-Z_]/.test(line[i]!)) {
            let j = i;
            while (j < line.length && /[a-zA-Z0-9_]/.test(line[j]!)) j++;
            const word = line.slice(i, j);

            if (KEYWORDS.has(word)) result += T.code.keyword(word);
            else if (TYPES.has(word)) result += T.code.type(word);
            else if (VISIBILITY.has(word)) result += T.code.visibility(word);
            else if (MUTABILITY.has(word)) result += T.code.mutability(word);
            else if (BUILTINS.has(word)) result += T.code.builtin(word);
            else if (word[0] === word[0]!.toUpperCase() && /[a-z]/.test(word.slice(1))) {
                // PascalCase — likely a contract/type name
                result += T.code.type(word);
            } else {
                result += T.code.identifier(word);
            }

            i = j;
            continue;
        }

        // ── Operators ─────────────────────────────────────────────────────────
        if (/[=+\-*/<>!&|^~%?:]/.test(line[i]!)) {
            let j = i;
            while (j < line.length && /[=+\-*/<>!&|^~%?:]/.test(line[j]!)) j++;
            result += T.code.operator(line.slice(i, j));
            i = j;
            continue;
        }

        // ── Punctuation ───────────────────────────────────────────────────────
        if (/[(){}[\];,.]/.test(line[i]!)) {
            result += T.code.punctuation(line[i]!);
            i++;
            continue;
        }

        // ── Whitespace and everything else ────────────────────────────────────
        result += line[i];
        i++;
    }

    return result;
}

export function highlightSolidity(code: string): string {
    return code.split('\n').map(highlightSolidityLine).join('\n');
}
