import type { Instruction } from '../../core/types';
import { bytesToHex } from '../../utils/hex';

export interface MatchedPattern {
    name: string;
    version: string | null;
    confidence: number;
    matchedFunctions: string[];
    description: string;
}

export interface PatternDefinition {
    name: string;
    version: string | null;
    description: string;
    selectors: string[];
    bytecodeHashes?: string[];
    storageLayout?: number[];
}

const KNOWN_PATTERNS: PatternDefinition[] = [
    {
        name: 'ERC20',
        version: 'OpenZeppelin v4.9.3',
        description: 'Standard fungible token implementation',
        selectors: [
            '0x18160ddd', '0x70a08231', '0xa9059cbb',
            '0x095ea7b3', '0x23b872dd', '0xdd62ed3e',
            '0x06fdde03', '0x95d89b41', '0x313ce567',
        ],
        storageLayout: [0, 1, 2],
    },
    {
        name: 'ERC20',
        version: 'OpenZeppelin v5.0.0',
        description: 'Standard fungible token (v5)',
        selectors: [
            '0x18160ddd', '0x70a08231', '0xa9059cbb',
            '0x095ea7b3', '0x23b872dd', '0xdd62ed3e',
            '0x06fdde03', '0x95d89b41', '0x313ce567',
            '0xd505accf', '0x7ecebe00',
        ],
        storageLayout: [0, 1, 2, 3],
    },
    {
        name: 'ERC721',
        version: 'OpenZeppelin v4.9.3',
        description: 'Standard non-fungible token implementation',
        selectors: [
            '0x70a08231', '0x095ea7b3', '0x23b872dd',
            '0x081812fc', '0x42842e0e', '0xb88d4fde',
            '0x6352211e', '0x06fdde03', '0x95d89b41',
        ],
        storageLayout: [0, 1],
    },
    {
        name: 'Ownable',
        version: 'OpenZeppelin v4.9.3',
        description: 'Access control with single owner',
        selectors: [
            '0x8da5cb5b', '0xf2fde38b',
        ],
        storageLayout: [0],
    },
    {
        name: 'Pausable',
        version: 'OpenZeppelin v4.9.3',
        description: 'Emergency stop mechanism',
        selectors: [
            '0x8456cb59', '0x01ffc9a7', '0x5c975abb',
        ],
        storageLayout: [0],
    },
    {
        name: 'UniswapV2Pair',
        version: 'Uniswap V2',
        description: 'Uniswap V2 liquidity pair contract',
        selectors: [
            '0x18160ddd', '0x70a08231', '0x23b872dd',
            '0x022c0d9f', '0x0dfe1681', '0xd21220a7',
            '0x1f00ca74', '0x485cc955', '0x3c1e4b3',
        ],
        storageLayout: [0, 1, 2, 3, 4, 5],
    },
    {
        name: 'UniswapV2Router',
        version: 'Uniswap V2',
        description: 'Uniswap V2 router for token swaps',
        selectors: [
            '0x7ff36ab5', '0x18cbafe5', '0x38ed1739',
            '0x791ac947', '0xe8e33700', '0xf305d719',
            '0x02751cec', '0x4a25d94a', '0xfb3bdb41',
            '0x5b0d5984', '0xd0e30db0', '0x2e1a7d4d',
            '0x0c49ccbe',
        ],
        storageLayout: [0, 1],
    },
    {
        name: 'WETH9',
        version: 'Canonical',
        description: 'Wrapped Ether implementation',
        selectors: [
            '0x18160ddd', '0x70a08231', '0xa9059cbb',
            '0x095ea7b3', '0x23b872dd', '0xdd62ed3e',
            '0xd0e30db0', '0x2e1a7d4d',
        ],
        storageLayout: [0, 1, 2],
    },
    {
        name: 'Multicall',
        version: null,
        description: 'Batch multiple calls in one transaction',
        selectors: [
            '0xac9650d8', '0x5ae401dc', '0x47b97e19',
        ],
    },
    {
        name: 'Proxy (ERC1967)',
        version: 'EIP-1967',
        description: 'Transparent upgradeable proxy',
        selectors: [
            '0x3593564c', '0xac9650d8',
        ],
    },
];

export class SignatureMatcher {
    match(selectors: string[], storageSlots: number[]): MatchedPattern[] {
        const results: MatchedPattern[] = [];

        for (const pattern of KNOWN_PATTERNS) {
            const matchedSelectors = pattern.selectors.filter((s) =>
                selectors.includes(s.toLowerCase())
            );

            if (matchedSelectors.length === 0) continue;

            const confidence = matchedSelectors.length / pattern.selectors.length;
            if (confidence < 0.5) continue;

            results.push({
                name: pattern.name,
                version: pattern.version,
                confidence,
                matchedFunctions: matchedSelectors,
                description: pattern.description,
            });
        }

        results.sort((a, b) => b.confidence - a.confidence);
        return results;
    }
}

export function matchPatterns(selectors: string[], storageSlots: number[] = []): MatchedPattern[] {
    return new SignatureMatcher().match(selectors, storageSlots);
}
