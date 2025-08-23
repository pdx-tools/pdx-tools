use std::collections::HashMap;

use eu4save::ProvinceId;

pub fn parse_continents(data: &[u8]) -> HashMap<String, Vec<ProvinceId>> {
    let mut result: HashMap<String, Vec<ProvinceId>> =
        jomini::text::de::from_windows1252_slice(data).unwrap();
    result.remove("island_check_provinces");
    result.remove("new_world");
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_parse_continents() {
        let data = br#"
asia = { 4296 }

island_check_provinces = {
	4296 # Bitlis- Europe/Asia/Africa
	852  # Mexico - America
	1084 # Wadjuk - West Australia
	1092 # Bundjalung - East Australia
	2728 # Tiwi - North Australia
}

# Used for RNW
new_world = {
}
"#;
        let continents = parse_continents(&data[..]);
        let expected: HashMap<_, _> = [(String::from("asia"), vec![ProvinceId::from(4296)])]
            .into_iter()
            .collect();

        assert_eq!(continents, expected);
    }
}
