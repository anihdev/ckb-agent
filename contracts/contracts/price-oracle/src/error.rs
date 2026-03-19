use ckb_std::error::SysError;

#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing,
    LengthNotEnough,
    Encoding,
    // Oracle specific errors
    InvalidArgs              = 10,
    InvalidDataSize          = 11,
    ZeroPrice                = 12,
    SequenceNotIncremented   = 13,
    PriceJumpTooLarge        = 14,
    NoOutputCell             = 15,
}

impl From<SysError> for Error {
    fn from(err: SysError) -> Self {
        match err {
            SysError::IndexOutOfBound    => Self::IndexOutOfBound,
            SysError::ItemMissing        => Self::ItemMissing,
            SysError::LengthNotEnough(_) => Self::LengthNotEnough,
            SysError::Encoding           => Self::Encoding,
            SysError::Unknown(_)         => Self::Encoding,
        }
    }
}
