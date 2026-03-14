use ckb_std::error::SysError;

#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing,
    LengthNotEnough,
    Encoding,
    // Contract specific errors
    InvalidArgs       = 10,
    InvalidDataSize   = 11,
    LTVExceeded       = 12,
    ZeroCollateral    = 13,
    Overflow          = 14,
    CapacityError     = 15,
    InsufficientCapacity = 16,
    NoInputCell       = 17,
}

impl From<SysError> for Error {
    fn from(err: SysError) -> Self {
        match err {
            SysError::IndexOutOfBound => Self::IndexOutOfBound,
            SysError::ItemMissing     => Self::ItemMissing,
            SysError::LengthNotEnough(_) => Self::LengthNotEnough,
            SysError::Encoding        => Self::Encoding,
            SysError::Unknown(_)      => Self::Encoding,
        }
    }
}
