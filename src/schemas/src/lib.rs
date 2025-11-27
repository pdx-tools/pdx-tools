#[allow(non_snake_case, unused_imports, clippy::all, mismatched_lifetime_syntaxes)]
#[rustfmt::skip]
mod eu4_generated;

pub mod resolver;

pub use eu4_generated::rakaly::eu_4 as eu4;
pub use flatbuffers;
pub use resolver::{FlatResolver, BREAKPOINT};

#[cfg(test)]
mod rkyv_size_tests {
    use crate::FlatResolver;
    
    #[derive(rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
    struct OwnedFlatResolver {
        values: Box<[Box<str>]>,
        breakpoint: u16,
    }

    impl<'a> From<&FlatResolver<'a>> for OwnedFlatResolver {
        fn from(resolver: &FlatResolver<'a>) -> Self {
            OwnedFlatResolver {
                values: resolver.values.iter()
                    .map(|s| s.to_string().into_boxed_str())
                    .collect(),
                breakpoint: resolver.breakpoint,
            }
        }
    }

    #[test]
    #[ignore]
    fn measure_rkyv_size() {
        let paths = vec![
            std::path::PathBuf::from("assets/tokens/eu4-raw.bin"),
            std::path::PathBuf::from("../../assets/tokens/eu4-raw.bin"),
            std::path::PathBuf::from("../../../../assets/tokens/eu4-raw.bin"),
        ];

        let data = paths.iter()
            .find_map(|p| std::fs::read(p).ok())
            .expect("Could not find token file");

        let resolver = FlatResolver::from_slice(&data);
        let owned = OwnedFlatResolver::from(&resolver);
        let rkyv_bytes = rkyv::to_bytes::<rkyv::rancor::Error>(&owned)
            .expect("Failed to serialize");
        
        let original_size = data.len();
        let rkyv_size = rkyv_bytes.len();
        let ratio = rkyv_size as f64 / original_size as f64;
        
        println!("\n=== RKYV Size Comparison ===");
        println!("Original eu4-raw.bin size: {} bytes ({:.2} KB)", 
                 original_size, original_size as f64 / 1024.0);
        println!("Serialized rkyv size: {} bytes ({:.2} KB)", 
                 rkyv_size, rkyv_size as f64 / 1024.0);
        println!("Ratio: {:.2}% ({:.2}x)", ratio * 100.0, ratio);
        
        if rkyv_size > original_size {
            let overhead = rkyv_size - original_size;
            println!("Overhead: {} bytes ({:.2} KB)", 
                     overhead, overhead as f64 / 1024.0);
        } else {
            let savings = original_size - rkyv_size;
            println!("Savings: {} bytes ({:.2} KB)", 
                     savings, savings as f64 / 1024.0);
        }
    }
}
