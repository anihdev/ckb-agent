"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createLatestTypeIdResolver = createLatestTypeIdResolver;
exports.createRpcResolver = createRpcResolver;
exports.refreshScriptConfigs = refreshScriptConfigs;
// prettier-ignore
/**
 * resolve the latest `OutPoint[]` that has consumed the old `OutPoint[]`
 */

// prettier-ignore

// prettier-ignore
/**
 * fetch cells with corresponding type script
 */

// prettier-ignore
/**
 * the minimal batch RPC client
 */

function createRpcResolver(rpc) {
  const fetchTxs = async txHashes => {
    const txs = await rpc.createBatchRequest(txHashes.map(txHash => ["getTransaction", txHash])).exec();
    return zipWith(txHashes, txs, (txHash, tx) => {
      if (!(tx !== null && tx !== void 0 && tx.transaction)) {
        throw new Error(`Cannot find transaction ${txHash}`);
      }
      return tx.transaction;
    });
  };
  const fetchIndexerCells = async scripts => {
    const res = await rpc.createBatchRequest(scripts.map(script => ["getCells", {
      script,
      scriptType: "type",
      scriptSearchMode: "exact",
      withData: false
    }, "asc", "0x1"])).exec();
    return res.map(item => item.objects[0]);
  };
  return createLatestTypeIdResolver(fetchTxs, fetchIndexerCells);
}
function createLatestTypeIdResolver(fetchOutputs, fetchTypeScriptCell) {
  return async oldOutPoints => {
    const txs = await fetchOutputs(oldOutPoints.map(outPoint => outPoint.txHash));
    const typeScripts = zipWith(oldOutPoints, txs, (outPoint, tx) => {
      nonNullable(outPoint);
      nonNullable(tx, `Cannot find the OutPoint ${outPoint.txHash}#${outPoint.index}`);
      return tx.outputs[Number(outPoint.index)].type;
    });

    // contracts may be dependent on `depGroup`, and the `depGroup` cell may not have a type script,
    // so we need to filter out the cells without type script
    const cells = await fetchTypeScriptCell(typeScripts.filter(Boolean));
    return zipWith(oldOutPoints, typeScripts, (oldOutPoint, typeScript) => {
      nonNullable(oldOutPoint);
      if (!typeScript) {
        return oldOutPoint;
      }
      const [cell] = cells.splice(0, 1);
      return cell.outPoint;
    });
  };
}
/**
 * Refreshing the config items in {@link ScriptConfigs} which are deployed with type id
 * @example
 * const updatedScriptConfigs = await refreshScriptConfigs(predefined.AGGRON4.SCRIPTS, { resolve: createRpcResolver(rpc) })
 * initializeConfig({ SCRIPTS: updatedScriptConfigs })
 */
async function refreshScriptConfigs(scriptConfigs, {
  resolve,
  skip = ["SECP256K1_BLAKE160", "SECP256K1_BLAKE160_MULTISIG", "DAO"]
}) {
  // prettier-ignore

  const configs = Object.entries(scriptConfigs).filter(([name, scriptConfig]) => !skip.includes(name) && (scriptConfig === null || scriptConfig === void 0 ? void 0 : scriptConfig.HASH_TYPE) === "type");
  const oldOutPoints = configs.map(([_, scriptConfig]) => ({
    txHash: scriptConfig.TX_HASH,
    index: scriptConfig.INDEX
  }));
  const newOutPoints = await resolve(oldOutPoints);
  const newScriptConfigs = Object.fromEntries(zipWith(configs, newOutPoints, (target, newOutPoint) => {
    nonNullable(target);
    const [name, original] = target;
    nonNullable(newOutPoint, `Refreshing failed, cannot load config of ${name}, please check whether the scriptConfig is correct`);
    return [name, {
      ...original,
      TX_HASH: newOutPoint.txHash,
      INDEX: newOutPoint.index
    }];
  }));
  return Object.assign({}, scriptConfigs, newScriptConfigs);
}
function zipWith(left, right, cb) {
  return left.map((_, i) => cb(left[i], right[i]));
}
function nonNullable(value, message = "Not nullable") {
  if (value == null) {
    throw new Error(message);
  }
}
//# sourceMappingURL=refresh.js.map