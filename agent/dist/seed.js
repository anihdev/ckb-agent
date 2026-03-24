import { ccc } from "@ckb-ccc/core";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.join(__dirname, "../../contracts/build/release");
function encodePosition(collateral, borrowed, ownerPrefix) {
    const buf = Buffer.alloc(24);
    buf.writeBigUInt64LE(collateral, 0);
    buf.writeBigUInt64LE(borrowed, 8);
    buf.writeBigUInt64LE(ownerPrefix, 16);
    return "0x" + buf.toString("hex");
}
async function main() {
    const client = new ccc.ClientPublicTestnet({
        url: process.env.CKB_RPC_URL || "https://testnet.ckb.dev/rpc",
    });
    const signer = new ccc.SignerCkbPrivateKey(client, process.env.AGENT_PRIVATE_KEY);
    const lockScript = (await signer.getAddressObjs())[0].script;
    const balance = await signer.getBalance();
    console.log(`[SEED] Balance: ${Number(balance) / 1e8} CKB`);
    // The contract cell dep - out_point of our deployed collateral contract
    const contractOutPoint = {
        txHash: process.env.COLLATERAL_CONTRACT_TX_HASH,
        index: 0,
    };
    // Compute actual code_hash from binary
    const binary = fs.readFileSync(path.join(CONTRACTS_DIR, "collateral-contract"));
    const codeHash = ccc.hashCkb(new Uint8Array(binary));
    console.log(`[SEED] Contract code_hash: ${codeHash}`);
    const positions = [
        {
            name: "SAFE position",
            collateral: 1200000000000n,
            borrowed: 40n,
            ownerPrefix: 0xabcd1234n,
        },
        {
            name: "WARNING position",
            collateral: 500000000000n,
            borrowed: 55n,
            ownerPrefix: 0xef567890n,
        },
        {
            name: "CRITICAL position",
            collateral: 300000000000n,
            borrowed: 72n,
            ownerPrefix: 0x11223344n,
        },
    ];
    const txHashes = [];
    for (const pos of positions) {
        console.log(`\n[SEED] Creating ${pos.name}...`);
        console.log(`[SEED]   Collateral: ${Number(pos.collateral) / 1e8} CKB`);
        console.log(`[SEED]   Borrowed:   ${pos.borrowed} RUSD`);
        const data = encodePosition(pos.collateral, pos.borrowed, pos.ownerPrefix);
        const ownerArgs = "0x" + pos.ownerPrefix.toString(16).padStart(16, "0");
        const tx = ccc.Transaction.from({
            cellDeps: [
                {
                    outPoint: contractOutPoint,
                    depType: "code",
                },
            ],
            outputs: [
                {
                    capacity: ccc.fixedPointFrom(300),
                    lock: lockScript,
                    type: {
                        codeHash: codeHash,
                        hashType: "data1",
                        args: ownerArgs,
                    },
                },
            ],
            outputsData: [data],
        });
        await tx.completeInputsByCapacity(signer);
        await tx.completeFeeBy(signer, 1000);
        const txHash = await signer.sendTransaction(tx);
        txHashes.push(txHash);
        console.log(`[SEED] ✅ ${pos.name} created! TX: ${txHash}`);
        await new Promise(r => setTimeout(r, 8000));
    }
    console.log("\n[SEED] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[SEED] All positions created! Add to .env:");
    console.log(`COLLATERAL_CODE_HASH=${codeHash}`);
    console.log("[SEED] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
main().catch(console.error);
