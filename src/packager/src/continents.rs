use std::collections::HashMap;

use eu4save::ProvinceId;

pub fn parse_continents(data: &[u8]) -> HashMap<String, Vec<ProvinceId>> {
    jomini::TextDeserializer::from_windows1252_slice(data).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_parse_continents() {
        let data = br#"
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
        let new_world: Vec<ProvinceId> = Vec::new();
        let island_check_provinces = vec![4296, 852, 1084, 1092, 2728];
        let island_check_provinces = island_check_provinces
            .into_iter()
            .map(ProvinceId::new)
            .collect::<Vec<_>>();

        assert_eq!(continents.get("new_world").unwrap(), &new_world);
        assert_eq!(
            continents.get("island_check_provinces").unwrap(),
            &island_check_provinces
        );
    }
}
