use ckb_std::error::SysError;

#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing,
    LengthNotEnough,
    Encoding,
    // Lock script specific errors
    InvalidArgs          = 10,
    MissingSignature     = 11,
    SpendLimitExceeded   = 12,
    UnauthorizedContract = 13,
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
