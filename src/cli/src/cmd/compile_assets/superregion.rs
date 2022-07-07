use std::collections::HashMap;

pub fn parse_superregions(data: &[u8]) -> HashMap<String, Vec<String>> {
    let regions: HashMap<String, Vec<String>> =
        jomini::TextDeserializer::from_windows1252_slice(data).unwrap();
    regions
        .into_iter()
        .map(|(key, val)| {
            (
                key,
                val.into_iter().filter(|x| x.contains("_region")).collect(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_parse_superregions() {
        let data = br#"
persia_superregion = {

	restrict_charter		# harder to get TC here.

	khorasan_region
	persia_region
	caucasia_region
}
        "#;

        let superregions = parse_superregions(&data[..]);
        let persia = vec![
            String::from("khorasan_region"),
            String::from("persia_region"),
            String::from("caucasia_region"),
        ];

        assert_eq!(superregions.get("persia_superregion").unwrap(), &persia);
    }
}
