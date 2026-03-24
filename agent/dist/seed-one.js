import { ccc } from "@ckb-ccc/core";
import dotenv from "dotenv";
dotenv.config();
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
    console.log(`[SEED] Creating CRITICAL position...`);
    const data = encodePosition(300000000000n, 72n, 0x11223344n);
    const tx = ccc.Transaction.from({
        cellDeps: [{ outPoint: { txHash: process.env.COLLATERAL_CONTRACT_TX_HASH, index: 0 }, depType: "code" }],
        outputs: [{
                capacity: ccc.fixedPointFrom(300),
                lock: lockScript,
                type: {
                    codeHash: process.env.COLLATERAL_CODE_HASH,
                    hashType: "data1",
                    args: "0x0000000011223344",
                },
            }],
        outputsData: [data],
    });
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000);
    const txHash = await signer.sendTransaction(tx);
    console.log(`[SEED] ✅ CRITICAL position created! TX: ${txHash}`);
}
main().catch(console.error);
