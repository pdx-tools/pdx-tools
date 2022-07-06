use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct Region {
    #[serde(default)]
    areas: Vec<String>,
}

pub fn parse_regions(data: &[u8]) -> HashMap<String, Vec<String>> {
    let regions: HashMap<String, Region> =
        jomini::TextDeserializer::from_windows1252_slice(data).unwrap();
    regions
        .into_iter()
        .map(|(key, val)| (key, val.areas))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_parse_regions() {
        let data = br#"
random_new_world_region = {
}

guinea_region = {
	areas = {
		benin_area
		cap_verde_area
		guinea_coast_area
		gulf_of_guinea_area
		futa_jallon_area
		west_africa_coast_area
		jolof_area
		sao_tome_area
	}
	monsoon = {
		00.06.01
		00.09.30
	}
}

low_countries_region = {
	areas = {
		wallonia_area
		flanders_area
		holland_area
		netherlands_area
		frisia_area
	}

}         
        "#;

        let regions = parse_regions(&data[..]);
        let guinea = vec![
            String::from("benin_area"),
            String::from("cap_verde_area"),
            String::from("guinea_coast_area"),
            String::from("gulf_of_guinea_area"),
            String::from("futa_jallon_area"),
            String::from("west_africa_coast_area"),
            String::from("jolof_area"),
            String::from("sao_tome_area"),
        ];
        let lowlands = vec![
            String::from("wallonia_area"),
            String::from("flanders_area"),
            String::from("holland_area"),
            String::from("netherlands_area"),
            String::from("frisia_area"),
        ];

        assert_eq!(regions.get("low_countries_region").unwrap(), &lowlands);
        assert_eq!(regions.get("guinea_region").unwrap(), &guinea);
    }
}
