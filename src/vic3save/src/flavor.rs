use jomini::{Encoding, Utf8Encoding, binary::BinaryFlavor};

/// The Vic3 binary flavor
#[derive(Debug, Default)]
pub struct Vic3Flavor(Utf8Encoding);

impl Vic3Flavor {
    /// Creates a new Vic3 flavor
    pub fn new() -> Self {
        Vic3Flavor(Utf8Encoding::new())
    }
}

impl Encoding for Vic3Flavor {
    fn decode<'a>(&self, data: &'a [u8]) -> std::borrow::Cow<'a, str> {
        self.0.decode(data)
    }
}

impl BinaryFlavor for Vic3Flavor {
    fn visit_f32(&self, data: [u8; 4]) -> f32 {
        f32::from_bits(u32::from_le_bytes(data))
    }

    fn visit_f64(&self, data: [u8; 8]) -> f64 {
        let x = i64::from_le_bytes(data) as f64;
        let eps = f64::from(f32::EPSILON);
        (x + (eps * x.signum())).trunc() / 100_000.0
    }
}
