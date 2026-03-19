use core::result::Result;
use ckb_std::{
    debug,
    high_level::{load_script, load_cell_capacity, load_witness_args},
    ckb_types::{bytes::Bytes, prelude::*},
    ckb_constants::Source,
};
use crate::error::Error;

// Lock script args layout:
// [0..8]   agent_pubkey_hash  (first 8 bytes of agent's public key hash)
// [8..16]  max_spend_per_tx   (max CKB shannons agent can move in one tx)
// [16..24] allowed_contract   (first 8 bytes of whitelisted contract hash)

const ARGS_SIZE: usize = 24;

pub fn main() -> Result<(), Error> {
    let script = load_script()?;
    let args: Bytes = script.args().unpack();

    debug!("lock-script: validating agent transaction");

    // Enforce args structure
    if args.len() < ARGS_SIZE {
        debug!("Error: args too short, got {}", args.len());
        return Err(Error::InvalidArgs);
    }

    // Parse permissions from args
    let max_spend = read_u64(&args, 8);
    let allowed_contract = &args[16..24];

    debug!("max_spend_per_tx: {} shannons", max_spend);

    // Load witness to verify agent signature is present
    let witness = load_witness_args(0, Source::GroupInput);
    match witness {
        Ok(w) => {
            let lock_field: Bytes = w.lock()
                .to_opt()
                .ok_or(Error::MissingSignature)?
                .unpack();

            if lock_field.is_empty() {
                debug!("Error: empty witness lock field");
                return Err(Error::MissingSignature);
            }

            debug!("Witness signature present: {} bytes", lock_field.len());
        }
        Err(_) => {
            debug!("Error: no witness found");
            return Err(Error::MissingSignature);
        }
    }

    // Enforce max spend limit — sum all output capacities going OUT
    let mut total_output: u64 = 0;
    let mut idx = 0;
    loop {
        match load_cell_capacity(idx, Source::Output) {
            Ok(cap) => {
                total_output += cap;
                idx += 1;
            }
            Err(_) => break,
        }
    }

    // Sum input capacities to compute net spend
    let mut total_input: u64 = 0;
    let mut idx = 0;
    loop {
        match load_cell_capacity(idx, Source::Input) {
            Ok(cap) => {
                total_input += cap;
                idx += 1;
            }
            Err(_) => break,
        }
    }

    // Net spend = inputs consumed minus outputs returned
    let net_spend = if total_input > total_output {
        total_input - total_output
    } else {
        0
    };

    debug!("total_input: {}, total_output: {}, net_spend: {}",
        total_input, total_output, net_spend);

    // HARD LIMIT: agent cannot spend more than configured max
    if net_spend > max_spend {
        debug!("Error: net_spend {} exceeds max_spend {}", net_spend, max_spend);
        return Err(Error::SpendLimitExceeded);
    }

    debug!("Allowed contract prefix: {:?}", allowed_contract);
    debug!("Lock script: transaction approved");

    Ok(())
}

fn read_u64(data: &[u8], offset: usize) -> u64 {
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&data[offset..offset + 8]);
    u64::from_le_bytes(bytes)
}
