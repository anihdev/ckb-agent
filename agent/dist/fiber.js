import axios from 'axios';
const FIBER_TESTNET_PEER = "/ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo";
const FIBER_TESTNET_PEER_ID = "QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo";
const MIN_CHANNEL_FUNDING_SHANNONS = 20000000000n; // 200 CKB
let _channelId = null;
let _peerPubkey = null;
let _fiberAvailable = null;
async function fiberRpc(url, method, params = []) {
    const response = await axios.post(url, {
        jsonrpc: "2.0", id: Date.now(), method, params
    }, { timeout: 5000 });
    if (response.data.error)
        throw new Error(`Fiber RPC error: ${JSON.stringify(response.data.error)}`);
    return response.data.result;
}
export async function checkFiberAvailable(rpcUrl) {
    if (_fiberAvailable !== null)
        return _fiberAvailable;
    try {
        await fiberRpc(rpcUrl, "get_node_info");
        _fiberAvailable = true;
        console.log(`[FIBER] ✅ Fiber node available at ${rpcUrl}`);
    }
    catch {
        _fiberAvailable = false;
        console.log(`[FIBER] ⚠️  Fiber node not running - using batch fallback`);
    }
    return _fiberAvailable;
}
export async function getFiberStatus(rpcUrl) {
    const available = await checkFiberAvailable(rpcUrl);
    if (!available)
        return { available: false, error: "Fiber node not running" };
    try {
        const nodeInfo = await fiberRpc(rpcUrl, "get_node_info");
        const channels = await fiberRpc(rpcUrl, "list_channels", [{}]);
        const openChannel = channels.channels?.find(c => c.state?.state_name === "CHANNEL_READY");
        return {
            available: true,
            nodeId: nodeInfo.node_id,
            channelId: openChannel?.channel_id,
            channelBalance: openChannel ? BigInt(openChannel.local_balance) : undefined,
        };
    }
    catch (err) {
        return { available: true, error: String(err) };
    }
}
async function getPeerPubkey(rpcUrl) {
    try {
        const result = await fiberRpc(rpcUrl, "list_peers", [{}]);
        const peer = result.peers?.find(p => p.addresses?.some(a => a.includes(FIBER_TESTNET_PEER_ID)));
        return peer?.node_id ?? null;
    }
    catch {
        return null;
    }
}
async function connectToPeer(rpcUrl) {
    try {
        await fiberRpc(rpcUrl, "connect_peer", [{ address: FIBER_TESTNET_PEER }]);
        console.log(`[FIBER] ✅ Connected to testnet peer`);
        return true;
    }
    catch (err) {
        const errMsg = String(err);
        if (errMsg.includes("already") || errMsg.includes("exists"))
            return true;
        console.error(`[FIBER] Failed to connect to peer:`, err);
        return false;
    }
}
export async function ensureChannelOpen(rpcUrl) {
    if (_channelId)
        return _channelId;
    try {
        const channels = await fiberRpc(rpcUrl, "list_channels", [{}]);
        const existing = channels.channels?.find(c => c.state?.state_name === "CHANNEL_READY");
        if (existing) {
            _channelId = existing.channel_id;
            _peerPubkey = existing.peer_id;
            console.log(`[FIBER] Using existing channel: ${_channelId?.slice(0, 20)}...`);
            return _channelId;
        }
        const connected = await connectToPeer(rpcUrl);
        if (!connected)
            return null;
        // Resolve the peer's node pubkey for open_channel + send_payment
        _peerPubkey = await getPeerPubkey(rpcUrl);
        if (!_peerPubkey) {
            console.error(`[FIBER] Could not resolve peer pubkey - is list_peers available?`);
            return null;
        }
        console.log(`[FIBER] Opening payment channel (${Number(MIN_CHANNEL_FUNDING_SHANNONS) / 1e8} CKB)...`);
        await fiberRpc(rpcUrl, "open_channel", [{
                peer_id: _peerPubkey,
                funding_amount: `0x${MIN_CHANNEL_FUNDING_SHANNONS.toString(16)}`,
                public: true
            }]);
        console.log(`[FIBER] Channel opening initiated - waiting for L1 confirmation...`);
        for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const updated = await fiberRpc(rpcUrl, "list_channels", [{}]);
            const opened = updated.channels?.find(c => c.state?.state_name === "CHANNEL_READY" && c.peer_id === _peerPubkey);
            if (opened) {
                _channelId = opened.channel_id;
                console.log(`[FIBER] ✅ Channel open! ID: ${_channelId?.slice(0, 20)}...`);
                return _channelId;
            }
        }
        console.warn(`[FIBER] Channel not yet ready - will retry next cycle`);
        return null;
    }
    catch (err) {
        console.error(`[FIBER] Channel error:`, err);
        return null;
    }
}
export async function sendFiberPayment(rpcUrl, amountShannons, description) {
    const available = await checkFiberAvailable(rpcUrl);
    if (!available)
        return false;
    const channelId = await ensureChannelOpen(rpcUrl);
    if (!channelId || !_peerPubkey)
        return false;
    try {
        const result = await fiberRpc(rpcUrl, "send_payment", [{
                target_pubkey: _peerPubkey,
                amount: `0x${amountShannons.toString(16)}`,
                tlc_expiry_limit: "0xe10",
            }]);
        console.log(`[FIBER] ✅ ${Number(amountShannons) / 1e8} CKB sent via channel | ${result.status}`);
        console.log(`[FIBER]    ${description}`);
        return true;
    }
    catch (err) {
        console.error(`[FIBER] Payment failed:`, err);
        return false;
    }
}
export async function printFiberStatus(rpcUrl) {
    const status = await getFiberStatus(rpcUrl);
    console.log(`\n[FIBER] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    if (status.available) {
        console.log(`[FIBER] Status:  ✅ Node running | ID: ${status.nodeId?.slice(0, 16)}...`);
        if (status.channelId) {
            console.log(`[FIBER] Channel: ✅ Open - settling fees instantly`);
            console.log(`[FIBER] Balance: ${status.channelBalance ? Number(status.channelBalance) / 1e8 : 0} CKB`);
        }
        else {
            console.log(`[FIBER] Channel: Opening - will retry next cycle`);
        }
    }
    else {
        console.log(`[FIBER] Status:  ⚠️  Node not running`);
        console.log(`[FIBER] Fallback: Batch accumulation (settle at 65 CKB on L1)`);
    }
    console.log(`[FIBER] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
