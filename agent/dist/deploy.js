import { ccc } from "@ckb-ccc/core";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.join(__dirname, "../../contracts/build/release");
async function deployContract(signer, name) {
    const binPath = path.join(CONTRACTS_DIR, name);
    const binary = fs.readFileSync(binPath);
    const hexData = "0x" + binary.toString("hex");
    console.log(`\n[DEPLOY] Deploying ${name}...`);
    console.log(`[DEPLOY] Binary size: ${binary.length} bytes`);
    const tx = ccc.Transaction.from({
        outputs: [
            {
                capacity: ccc.fixedPointFrom(binary.length + 100), // data + overhead
                lock: await signer.getRecommendedAddressObj().then(a => a.script),
            },
        ],
        outputsData: [hexData],
    });
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000);
    const txHash = await signer.sendTransaction(tx);
    console.log(`[DEPLOY] ✅ ${name} deployed!`);
    console.log(`[DEPLOY]    TX Hash: ${txHash}`);
    console.log(`[DEPLOY]    Add to .env: ${name.toUpperCase().replace(/-/g, '_')}_TX_HASH=${txHash}`);
    return txHash;
}
async function main() {
    const client = new ccc.ClientPublicTestnet();
    const signer = new ccc.SignerCkbPrivateKey(client, process.env.AGENT_PRIVATE_KEY);
    const address = await signer.getRecommendedAddress();
    const balance = await signer.getBalance();
    console.log(`[DEPLOY] Agent address: ${address}`);
    console.log(`[DEPLOY] Balance: ${Number(balance) / 1e8} CKB`);
    if (balance < 100000000000n) {
        throw new Error("Insufficient balance — need at least 1000 CKB for deployments");
    }
    const contracts = ["collateral-contract", "price-oracle", "lock-script"];
    const hashes = {};
    const force = process.argv.includes('--force');
    for (const name of contracts) {
        const envKey = name.toUpperCase().replace(/-/g, '_') + '_TX_HASH';
        const existing = process.env[envKey];
        if (existing && !force) {
            console.log(`\n[DEPLOY] Skipping ${name} — already deployed (${envKey})`);
            hashes[name] = existing;
            continue;
        }
        hashes[name] = await deployContract(signer, name);
        // Wait for confirmation between deployments
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log("\n[DEPLOY] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[DEPLOY] All contracts deployed. Add to .env:");
    console.log(`COLLATERAL_CONTRACT_TX_HASH=${hashes["collateral-contract"]}`);
    console.log(`PRICE_ORACLE_TX_HASH=${hashes["price-oracle"]}`);
    console.log(`LOCK_SCRIPT_TX_HASH=${hashes["lock-script"]}`);
    console.log("[DEPLOY] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
main().catch(console.error);
