use core::result::Result;
use ckb_std::{
    debug,
    high_level::{load_script, load_cell_data, load_cell_capacity},
    ckb_types::{bytes::Bytes, prelude::*},
    ckb_constants::Source,
};
use crate::error::Error;

// Position layout in cell data (all u64, little-endian):
// [0..8]   collateral_amount  (in CKB shannons)
// [8..16]  borrowed_amount    (in RUSD units)
// [16..24] owner_lock_hash    (first 8 bytes as identifier)

const DATA_SIZE: usize = 24;
const MAX_LTV: u64 = 80; // 80% max loan-to-value

pub fn main() -> Result<(), Error> {
    let script = load_script()?;
    let args: Bytes = script.args().unpack();

    debug!("collateral-contract: args length = {}", args.len());

    // Args must contain owner identifier (at least 8 bytes)
    if args.len() < 8 {
        debug!("Error: args too short");
        return Err(Error::InvalidArgs);
    }

    // Load current cell data
    let cell_data = load_cell_data(0, Source::GroupOutput);

    match cell_data {
        Ok(data) => {
            // New or updated position — validate it
            if data.len() != DATA_SIZE {
                debug!("Error: invalid data size {}", data.len());
                return Err(Error::InvalidDataSize);
            }

            let collateral = read_u64(&data, 0);
            let borrowed = read_u64(&data, 8);

            debug!("collateral: {} shannons, borrowed: {} RUSD", collateral, borrowed);

            // Enforce LTV limit: borrowed / collateral <= MAX_LTV / 100
            // Using CKB price assumption: 1 CKB = 100 shannon units for simplicity
            if collateral == 0 {
                debug!("Error: zero collateral");
                return Err(Error::ZeroCollateral);
            }

            // LTV check: (borrowed * 100) / collateral <= MAX_LTV
            let ltv = (borrowed * 100).checked_div(collateral)
                .ok_or(Error::Overflow)?;

            debug!("LTV: {}%", ltv);

            if ltv > MAX_LTV {
                debug!("Error: LTV {} exceeds max {}", ltv, MAX_LTV);
                return Err(Error::LTVExceeded);
            }

            // Verify cell capacity covers the data
            let capacity = load_cell_capacity(0, Source::GroupOutput)
                .map_err(|_| Error::CapacityError)?;

            debug!("cell capacity: {}", capacity);

            if capacity < 6_100_000_000u64 {
                // Minimum 61 CKB to store this cell
                return Err(Error::InsufficientCapacity);
            }

            debug!("Position validated successfully");
            Ok(())
        }
        Err(_) => {
            // No output cell in this group — this is a repay/close operation
            // Just verify the input exists
            let input_data = load_cell_data(0, Source::GroupInput)
                .map_err(|_| Error::NoInputCell)?;

            if input_data.len() != DATA_SIZE {
                return Err(Error::InvalidDataSize);
            }

            debug!("Position closed/repaid successfully");
            Ok(())
        }
    }
}

// Read u64 little-endian from byte slice at offset
fn read_u64(data: &[u8], offset: usize) -> u64 {
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&data[offset..offset + 8]);
    u64::from_le_bytes(bytes)
}
