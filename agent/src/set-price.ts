import { ccc } from "@ckb-ccc/core";
import dotenv from "dotenv";
dotenv.config();

// Encode price cell: price(u64 LE) + timestamp(u64 LE) + sequence(u64 LE)
function encodePriceData(priceX1000: bigint, sequence: bigint): string {
  const buf = Buffer.alloc(24);
  buf.writeBigUInt64LE(priceX1000, 0);      // $0.015 = 15
  buf.writeBigUInt64LE(BigInt(Date.now()), 8);
  buf.writeBigUInt64LE(sequence, 16);
  return "0x" + buf.toString("hex");
}

async function main() {
  const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL! });
  const signer = new ccc.SignerCkbPrivateKey(client, process.env.AGENT_PRIVATE_KEY!);
  const lockScript = (await signer.getAddressObjs())[0].script;

  // CKB price = $0.015 -> stored as 15 (x1000)
  const data = encodePriceData(15n, 1n);
  console.log(`[PRICE] Setting CKB price to $0.015 (encoded as 15 x1000)`);

  const tx = ccc.Transaction.from({
    outputs: [{ capacity: ccc.fixedPointFrom(200), lock: lockScript }],
    outputsData: [data],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000);

  const txHash = await signer.sendTransaction(tx);
  console.log(`[PRICE] Price cell created! TX: ${txHash}`);
  console.log(`[PRICE] Update .env: PRICE_ORACLE_TX_HASH=${txHash}`);
}

main().catch(console.error);
