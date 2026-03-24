import { ccc } from "@ckb-ccc/core";
import { classifyRisk } from './classifier.js';
let _client = null;
function getClient(config) {
    if (!_client) {
        _client = new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });
    }
    return _client;
}
function readU64LE(data, offset) {
    let value = 0n;
    for (let i = 7; i >= 0; i--) {
        value = (value << 8n) | BigInt(data[offset + i]);
    }
    return value;
}
async function fetchCurrentPrice(config) {
    if (!config.priceOracleTxHash) {
        console.log(`[FETCHER] Using mock price $0.015 per CKB`);
        return 15n;
    }
    try {
        const client = getClient(config);
        const tx = await client.getTransaction(config.priceOracleTxHash);
        if (!tx)
            return 15n;
        const data = tx.transaction.outputsData[0];
        if (!data || data === "0x")
            return 15n;
        const bytes = ccc.bytesFrom(data);
        // check price data is exactly 24 bytes (price + timestamp + sequence)
        if (bytes.length !== 24) {
            console.log(`[FETCHER] Oracle TX is not a price cell, using mock price $0.015`);
            return 15n;
        }
        const price = readU64LE(bytes, 0);
        // Reject absurd prices (must be between $0.001 and $1000)
        if (price < 1n || price > 1000000n) {
            console.log(`[FETCHER] Oracle price out of range, using mock price $0.015`);
            return 15n;
        }
        console.log(`[FETCHER] Oracle price: $${Number(price) / 1000} per CKB`);
        // Warn if the oracle timestamp is stale
        try {
            checkOracleStaleness(bytes);
        }
        catch (e) { /* non-fatal */ }
        return price;
    }
    catch {
        console.log(`[FETCHER] Oracle fetch failed, using mock price`);
        return 15n;
    }
}
export function checkOracleStaleness(data) {
    if (data.length < 16)
        return;
    // Oracle layout: price (8 bytes LE) | timestamp (8 bytes LE) | seq (8 bytes)
    const timestamp = readU64LE(data, 8);
    const ageMs = Date.now() - Number(timestamp);
    if (ageMs < 0)
        return; // timestamp in future — ignore
    const ageHours = ageMs / 3600000;
    if (ageHours > 1) {
        console.warn(`[FETCHER] ⚠️  Oracle price is ${ageHours.toFixed(1)}h old — consider running npm run set-price`);
    }
}
export async function fetchPositions(config) {
    const ckbPrice = await fetchCurrentPrice(config);
    const positions = [];
    if (!config.collateralContractTxHash || !config.collateralCodeHash) {
        console.log(`[FETCHER] No contract configured, using mock positions`);
        return mockPositions(config, ckbPrice);
    }
    try {
        const client = getClient(config);
        const typeScript = {
            codeHash: config.collateralCodeHash,
            hashType: "data1",
            args: "0x",
        };
        console.log(`[FETCHER] Scanning for collateral cells on-chain...`);
        for await (const cell of client.findCells({
            script: typeScript,
            scriptType: "type",
            scriptSearchMode: "prefix",
        })) {
            try {
                const data = ccc.bytesFrom(cell.outputData);
                if (data.length < 24)
                    continue;
                const collateral = readU64LE(data, 0);
                const borrowed = readU64LE(data, 8);
                const owner = "0x" + Buffer.from(data.slice(16, 24)).toString("hex");
                const { ltv, risk } = classifyRisk(collateral, borrowed, ckbPrice, config);
                positions.push({ owner, collateral, borrowed, ltv, risk });
                console.log(`[FETCHER] Found position: owner=${owner} collateral=${Number(collateral) / 1e8}CKB borrowed=${borrowed}RUSD`);
            }
            catch {
                console.warn(`[FETCHER] Failed to parse cell`);
            }
        }
        if (positions.length === 0) {
            console.log(`[FETCHER] No positions found on-chain, falling back to mock`);
            return mockPositions(config, ckbPrice);
        }
    }
    catch (err) {
        console.error(`[FETCHER] Indexer error, falling back to mock:`, err);
        return mockPositions(config, ckbPrice);
    }
    // Deduplicate by owner — keep the first cell found per owner
    const seen = new Set();
    const unique = positions.filter(p => {
        if (seen.has(p.owner))
            return false;
        seen.add(p.owner);
        return true;
    });
    if (unique.length < positions.length) {
        console.log(`[FETCHER] Deduplicated: ${positions.length} cells → ${unique.length} unique owners`);
    }
    return unique;
}
function mockPositions(config, ckbPrice) {
    const mocks = [
        { owner: '0xabcd123400000000', collateral: 500000000000n, borrowed: 55n },
        { owner: '0xef56789000000000', collateral: 1200000000000n, borrowed: 40n },
        { owner: '0x1122334400000000', collateral: 300000000000n, borrowed: 72n },
    ];
    return mocks.map(m => {
        const { ltv, risk } = classifyRisk(m.collateral, m.borrowed, ckbPrice, config);
        return { owner: m.owner, collateral: m.collateral, borrowed: m.borrowed, ltv, risk };
    });
}
