use eu4save::ProvinceId;
use std::collections::HashMap;

pub fn parse_areas(data: &[u8]) -> HashMap<String, Vec<ProvinceId>> {
    jomini::text::de::from_windows1252_slice(data).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_parse_areas() {
        let data = br#"
        lower_doab_area = { #4
            color = { 212 199 59 }
            524 556 2063 4496
        }
        
        lahore_area = { #5 (approximate Lahore Subah)
            507 2075 2076 4510 4513
        }

        gujarat_area = { }
        "#;

        let areas = parse_areas(&data[..]);
        let doab = vec![524, 556, 2063, 4496];
        let doab = doab.into_iter().map(ProvinceId::new).collect::<Vec<_>>();
        let lahore = vec![507, 2075, 2076, 4510, 4513];
        let lahore = lahore.into_iter().map(ProvinceId::new).collect::<Vec<_>>();
        let gujarat: Vec<ProvinceId> = vec![];
        assert_eq!(areas.get("lower_doab_area").unwrap(), &doab);
        assert_eq!(areas.get("lahore_area").unwrap(), &lahore);
        assert_eq!(areas.get("gujarat_area").unwrap(), &gujarat);
    }
}
