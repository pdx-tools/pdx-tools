pub(crate) fn le_u32(data: &[u8]) -> u32 {
    debug_assert!(data.len() >= 4);
    u32::from_le_bytes([data[0], data[1], data[2], data[3]])
}

pub(crate) fn le_i32(data: &[u8]) -> i32 {
    debug_assert!(data.len() >= 4);
    i32::from_le_bytes([data[0], data[1], data[2], data[3]])
}

pub(crate) fn le_u16(data: &[u8]) -> u16 {
    debug_assert!(data.len() >= 2);
    u16::from_le_bytes([data[0], data[1]])
}

pub(crate) fn next_u32(data: &[u8]) -> (u32, &[u8]) {
    let v = le_u32(data);
    (v, &data[4..])
}

pub(crate) fn next_i32(data: &[u8]) -> (i32, &[u8]) {
    let v = le_i32(data);
    (v, &data[4..])
}

pub(crate) fn next_u16(data: &[u8]) -> (u16, &[u8]) {
    let v = le_u16(data);
    (v, &data[2..])
}
