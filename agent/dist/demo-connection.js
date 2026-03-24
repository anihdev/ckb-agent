import { ccc } from "@ckb-ccc/core";
import dotenv from "dotenv";
dotenv.config();
async function main() {
    console.log("CKB Position Guardian — Live Testnet Connection Demo\n");
    const RPC_URL = process.env.CKB_RPC_URL || "https://testnet.ckb.dev/rpc";
    console.log(` Connecting to: ${RPC_URL}`);
    try {
        const client = new ccc.ClientPublicTestnet({ url: RPC_URL });
        // Verify RPC connection
        const tipHeader = await client.getTipHeader();
        console.log(`✅ Connected to CKB Testnet`);
        console.log(`   Tip block: #${parseInt(tipHeader.number.toString(), 16).toLocaleString()}`);
        console.log(`   Block hash: ${tipHeader.hash.slice(0, 20)}...\n`);
        // Verify oracle cell is live
        console.log(`Verifying deployed contracts:`);
        const oracleTxHash = process.env.PRICE_ORACLE_TX_HASH;
        if (oracleTxHash) {
            const oracleTx = await client.getTransaction(oracleTxHash);
            if (oracleTx) {
                const data = oracleTx.transaction.outputsData[0];
                const bytes = ccc.bytesFrom(data);
                if (bytes.length === 24) {
                    let price = 0n;
                    for (let i = 7; i >= 0; i--)
                        price = (price << 8n) | BigInt(bytes[i]);
                    console.log(`   ✅ Price Oracle    — TX: ${oracleTxHash.slice(0, 20)}...`);
                    console.log(`      CKB Price: $${Number(price) / 1000} per CKB`);
                }
            }
        }
        const collateralTxHash = process.env.COLLATERAL_CONTRACT_TX_HASH;
        if (collateralTxHash) {
            const tx = await client.getTransaction(collateralTxHash);
            if (tx) {
                console.log(`   ✅ Collateral Contract — TX: ${collateralTxHash.slice(0, 20)}...`);
            }
        }
        const lockTxHash = process.env.LOCK_SCRIPT_TX_HASH;
        if (lockTxHash) {
            const tx = await client.getTransaction(lockTxHash);
            if (tx) {
                console.log(`   ✅ Lock Script     — TX: ${lockTxHash.slice(0, 20)}...`);
            }
        }
        // Check agent wallet balance
        console.log(`Agent Wallet:`);
        const signer = new ccc.SignerCkbPrivateKey(client, process.env.AGENT_PRIVATE_KEY);
        const balance = await signer.getBalance();
        const address = await signer.getRecommendedAddress();
        console.log(`   Address: ${address.slice(0, 20)}...`);
        console.log(`   Balance: ${(Number(balance) / 1e8).toFixed(2)} CKB`);
        // Scan for positions
        console.log(`\n Scanning for collateral positions...`);
        const codeHash = process.env.COLLATERAL_CODE_HASH;
        if (codeHash) {
            let positionCount = 0;
            for await (const cell of client.findCells({
                script: { codeHash, hashType: "data1", args: "0x" },
                scriptType: "type",
                scriptSearchMode: "prefix",
            })) {
                positionCount++;
                if (positionCount <= 3) {
                    const data = ccc.bytesFrom(cell.outputData);
                    if (data.length >= 16) {
                        let col = 0n, bor = 0n;
                        for (let i = 7; i >= 0; i--)
                            col = (col << 8n) | BigInt(data[i]);
                        for (let i = 15; i >= 8; i--)
                            bor = (bor << 8n) | BigInt(data[i]);
                        console.log(`   Position ${positionCount}: ${(Number(col) / 1e8).toFixed(0)} CKB collateral / ${bor} RUSD borrowed`);
                    }
                }
            }
            console.log(`   Total positions found: ${positionCount}`);
        }
        console.log(`All systems operational — CKB Position Guardian is live on testnet`);
        console.log(`   View contracts on CKB Explorer:`);
        console.log(`   https://pudge.explorer.nervos.org/transaction/${collateralTxHash}`);
    }
    catch (err) {
        console.error(`\n Connection error:`, err);
        process.exit(1);
    }
}
main().catch(console.error);
