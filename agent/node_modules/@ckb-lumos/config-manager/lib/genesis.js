"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SIGHASH_OUTPUT_LOC = exports.SIGHASH_GROUP_OUTPUT_LOC = exports.MULTISIG_OUTPUT_LOC = exports.MULTISIG_GROUP_OUTPUT_LOC = exports.DAO_OUTPUT_LOC = void 0;
exports.generateGenesisScriptConfigs = generateGenesisScriptConfigs;
var _base = require("@ckb-lumos/base");
// https://github.com/nervosnetwork/ckb-sdk-rust/blob/94ce4379454cdaf046f64b346e18e73e029f0ae6/src/constants.rs#L19C1-L24C62
// the index of a transaction in a block

// the index of an output in a transaction

const SIGHASH_OUTPUT_LOC = exports.SIGHASH_OUTPUT_LOC = [0, 1];
const MULTISIG_OUTPUT_LOC = exports.MULTISIG_OUTPUT_LOC = [0, 4];
const DAO_OUTPUT_LOC = exports.DAO_OUTPUT_LOC = [0, 2];
const SIGHASH_GROUP_OUTPUT_LOC = exports.SIGHASH_GROUP_OUTPUT_LOC = [1, 0];
// prettier-ignore
const MULTISIG_GROUP_OUTPUT_LOC = exports.MULTISIG_GROUP_OUTPUT_LOC = [1, 1];

/**
 * Generate {@link ScriptConfig} for the genesis block,
 * use this function when you are on a testnet,
 * or you cannot determine which network you are on
 * @example
 *   const rpc = new RPC('http://localhost:8114')
 *   const genesisBlock = await rpc.getBlockByNumber('0x0')
 *   const scriptConfig = generateGenesisScriptConfigs(genesisBlock)
 * @param genesisBlock
 */
function generateGenesisScriptConfigs(genesisBlock) {
  if (!genesisBlock || Number(genesisBlock.header.number) !== 0) {
    throw new Error("The block must be a genesis block");
  }
  const transactions = genesisBlock.transactions;
  return {
    SECP256K1_BLAKE160: {
      ...createScriptConfig({
        transaction: transactions[SIGHASH_OUTPUT_LOC[0]],
        outputIndex: SIGHASH_OUTPUT_LOC[1],
        depGroupTransaction: transactions[SIGHASH_GROUP_OUTPUT_LOC[0]],
        depGroupOutputIndex: SIGHASH_GROUP_OUTPUT_LOC[1]
      }),
      SHORT_ID: 0
    },
    SECP256K1_BLAKE160_MULTISIG: {
      ...createScriptConfig({
        transaction: transactions[MULTISIG_OUTPUT_LOC[0]],
        outputIndex: MULTISIG_OUTPUT_LOC[1],
        depGroupTransaction: transactions[MULTISIG_GROUP_OUTPUT_LOC[0]],
        depGroupOutputIndex: MULTISIG_GROUP_OUTPUT_LOC[1]
      }),
      SHORT_ID: 1
    },
    DAO: createScriptConfig({
      transaction: transactions[DAO_OUTPUT_LOC[0]],
      outputIndex: DAO_OUTPUT_LOC[1]
    })
  };
}
function createScriptConfig(config) {
  var _transaction$outputs$;
  const {
    transaction,
    outputIndex
  } = config;
  const codeHash = _base.utils.computeScriptHash(mustGenesisBlock((_transaction$outputs$ = transaction.outputs[outputIndex]) === null || _transaction$outputs$ === void 0 ? void 0 : _transaction$outputs$.type));
  if ("depGroupTransaction" in config) {
    const {
      depGroupOutputIndex,
      depGroupTransaction
    } = config;
    return {
      HASH_TYPE: "type",
      CODE_HASH: codeHash,
      DEP_TYPE: "depGroup",
      TX_HASH: mustGenesisBlock(depGroupTransaction.hash),
      INDEX: toHexNumber(depGroupOutputIndex)
    };
  }
  return {
    HASH_TYPE: "type",
    CODE_HASH: codeHash,
    DEP_TYPE: "code",
    INDEX: toHexNumber(outputIndex),
    TX_HASH: mustGenesisBlock(transaction.hash)
  };
}
function mustGenesisBlock(x) {
  if (x == null) {
    throw new Error("The block must be a genesis block");
  }
  return x;
}
function toHexNumber(number) {
  return `0x${number.toString(16)}`;
}
//# sourceMappingURL=genesis.js.map