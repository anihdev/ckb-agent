import { ccc } from "@ckb-ccc/core";
import { Config } from './config.js';

export interface HealthResult {
  passed: boolean;
  checks: { name: string; ok: boolean; message: string }[];
}

export async function runStartupHealthCheck(config: Config): Promise<HealthResult> {
  const checks: { name: string; ok: boolean; message: string }[] = [];
  console.log(`\n[HEALTH] Running pre-flight checks...`);

  const client = new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });

  // 1. RPC connectivity
  try {
    const tip = await client.getTipHeader();
    const block = parseInt(tip.number.toString(), 16);
    checks.push({ name: "CKB RPC", ok: true, message: `Connected — tip block #${block.toLocaleString()}` });
  } catch {
    checks.push({ name: "CKB RPC", ok: false, message: `Cannot reach ${config.ckbRpcUrl}` });
  }

  // 2. Collateral contract reachable
  if (config.collateralContractTxHash) {
    try {
      const tx = await client.getTransaction(config.collateralContractTxHash);
      checks.push({ name: "Collateral Contract", ok: !!tx, message: tx ? "Found on-chain" : "TX not found" });
    } catch {
      checks.push({ name: "Collateral Contract", ok: false, message: "Failed to fetch TX" });
    }
  } else {
    checks.push({ name: "Collateral Contract", ok: false, message: "COLLATERAL_CONTRACT_TX_HASH not set in .env" });
  }

  // 3. Oracle cell valid and fresh
  if (config.priceOracleTxHash) {
    try {
      const tx = await client.getTransaction(config.priceOracleTxHash);
      if (!tx) {
        checks.push({ name: "Price Oracle", ok: false, message: "Oracle TX not found" });
      } else {
        const data = tx.transaction.outputsData[0];
        const bytes = ccc.bytesFrom(data);
        if (bytes.length !== 24) {
          checks.push({ name: "Price Oracle", ok: false, message: `Invalid oracle data length: ${bytes.length} bytes (expected 24)` });
        } else {
          // Read price (bytes 0-7) and timestamp (bytes 8-15)
          let price = 0n, timestamp = 0n;
          for (let i = 7; i >= 0; i--) price = (price << 8n) | BigInt(bytes[i]);
          for (let i = 15; i >= 8; i--) timestamp = (timestamp << 8n) | BigInt(bytes[i]);

          const ageMs = Date.now() - Number(timestamp);
          const ageHours = ageMs / 3_600_000;
          const priceUsd = Number(price) / 1000;

          if (ageHours > 1) {
            checks.push({
              name: "Price Oracle",
              ok: false,
              message: `⚠️  Stale price — $${priceUsd} last updated ${ageHours.toFixed(1)}h ago. Run npm run set-price to refresh.`
            });
          } else {
            checks.push({ name: "Price Oracle", ok: true, message: `$${priceUsd} per CKB — updated ${(ageMs / 60000).toFixed(0)}m ago` });
          }
        }
      }
    } catch {
      checks.push({ name: "Price Oracle", ok: false, message: "Failed to fetch oracle cell" });
    }
  } else {
    checks.push({ name: "Price Oracle", ok: false, message: "PRICE_ORACLE_TX_HASH not set in .env" });
  }

  // 4. Agent wallet funded
  try {
    const signer = new ccc.SignerCkbPrivateKey(client, config.agentPrivateKey);
    const balance = await signer.getBalance();
    const ckb = Number(balance) / 1e8;
    const ok = ckb >= 100;
    checks.push({
      name: "Agent Wallet",
      ok,
      message: ok ? `${ckb.toFixed(2)} CKB — sufficient` : `${ckb.toFixed(2)} CKB — low balance, top up via faucet`
    });
  } catch {
    checks.push({ name: "Agent Wallet", ok: false, message: "Could not read wallet balance" });
  }

  // 5. Collateral code hash set
  checks.push({
    name: "Code Hash",
    ok: !!config.collateralCodeHash,
    message: config.collateralCodeHash
      ? `Set — ${config.collateralCodeHash.slice(0, 20)}...`
      : "COLLATERAL_CODE_HASH not set — run npm run deploy first"
  });

  // Print results
  console.log(`[HEALTH] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const check of checks) {
    const icon = check.ok ? "ok" : "bad";
    console.log(`[HEALTH] ${icon} ${check.name.padEnd(22)} ${check.message}`);
  }
  console.log(`[HEALTH] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const passed = checks.every(c => c.ok);
  if (!passed) {
    const failed = checks.filter(c => !c.ok).map(c => c.name).join(", ");
    console.log(`[HEALTH] ⚠️  Some checks failed: ${failed}`);
    console.log(`[HEALTH] Agent will continue but may operate on mock data.\n`);
  } else {
    console.log(`[HEALTH] ✅ All checks passed — agent starting on live data.\n`);
  }

  return { passed, checks };
}
