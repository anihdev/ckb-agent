use core::result::Result;
use ckb_std::{
    debug,
    high_level::{load_script, load_cell_data},
    ckb_types::{bytes::Bytes, prelude::*},
    ckb_constants::Source,
};
use crate::error::Error;

// Price cell data layout (all u64, little-endian):
// [0..8]   ckb_price_usd      (price * 1000, e.g. 1500 = $1.50)
// [8..16]  last_updated       (unix timestamp)
// [16..24] sequence_number    (increments each update, prevents replay)

const DATA_SIZE: usize = 24;
const MAX_PRICE_JUMP: u64 = 50; // reject if price moves >50% in one update

pub fn main() -> Result<(), Error> {
    let script = load_script()?;
    let args: Bytes = script.args().unpack();

    // Args must contain oracle authority identifier (8 bytes)
    if args.len() < 8 {
        return Err(Error::InvalidArgs);
    }

    let new_data = load_cell_data(0, Source::GroupOutput)
        .map_err(|_| Error::NoOutputCell)?;

    if new_data.len() != DATA_SIZE {
        debug!("Error: invalid price data size {}", new_data.len());
        return Err(Error::InvalidDataSize);
    }

    let new_price = read_u64(&new_data, 0);
    let new_timestamp = read_u64(&new_data, 8);
    let new_sequence = read_u64(&new_data, 16);

    debug!("New price: ${} (x1000), timestamp: {}, seq: {}",
        new_price, new_timestamp, new_sequence);

    // Price must be non-zero
    if new_price == 0 {
        return Err(Error::ZeroPrice);
    }

    // Check against previous price cell if it exists
    let prev_data = load_cell_data(0, Source::GroupInput);
    if let Ok(prev) = prev_data {
        if prev.len() == DATA_SIZE {
            let prev_price = read_u64(&prev, 0);
            let prev_sequence = read_u64(&prev, 16);

            // Sequence must increment
            if new_sequence <= prev_sequence {
                debug!("Error: sequence not incremented {} -> {}", prev_sequence, new_sequence);
                return Err(Error::SequenceNotIncremented);
            }

            // Sanity check: reject extreme price movements (oracle manipulation guard)
            if prev_price > 0 {
                let change = if new_price > prev_price {
                    (new_price - prev_price) * 100 / prev_price
                } else {
                    (prev_price - new_price) * 100 / prev_price
                };

                debug!("Price change: {}%", change);

                if change > MAX_PRICE_JUMP {
                    debug!("Error: price jump {}% exceeds max {}%", change, MAX_PRICE_JUMP);
                    return Err(Error::PriceJumpTooLarge);
                }
            }
        }
    }

    debug!("Price oracle update validated successfully");
    Ok(())
}

fn read_u64(data: &[u8], offset: usize) -> u64 {
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&data[offset..offset + 8]);
    u64::from_le_bytes(bytes)
}
