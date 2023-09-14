use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, PartialEq)]
pub struct Religion {
    pub id: String,
    pub name: String,
    pub colors: [u8; 3],
    pub allowed_conversions: Vec<String>,
}

#[derive(Debug, PartialEq)]
pub struct RawReligion {
    pub id: String,
    pub colors: [u8; 3],
    pub allowed_conversions: Vec<String>,
}

#[derive(Debug, PartialEq, Deserialize)]
pub struct ReligionBody {
    pub color: [u8; 3],
    #[serde(default, alias = "allowed_conversion")]
    pub allowed_conversions: Vec<String>,
}

#[derive(Debug, PartialEq, Deserialize)]
pub struct MaybeReligion {
    pub color: Option<[u8; 3]>,
}

pub fn parse_enhanced_religions(
    data: &[u8],
    localization: &HashMap<String, String>,
) -> Vec<Religion> {
    parse_religions(data)
        .into_iter()
        .map(|religion| Religion {
            id: religion.id.clone(),
            name: String::from(localization.get(&religion.id).unwrap()),
            colors: religion.colors,
            allowed_conversions: religion.allowed_conversions,
        })
        .collect()
}

pub fn parse_religions(data: &[u8]) -> Vec<RawReligion> {
    let tape = jomini::TextTape::from_slice(data).unwrap();
    let reader = tape.windows1252_reader();
    let mut result = Vec::new();
    for (_, _, value) in reader.fields() {
        if let Ok(religion_group) = value.read_object() {
            for (key, _, value) in religion_group.fields() {
                let religion_name = key.read_str();
                if let Ok(religion) = value.read_object() {
                    let de: MaybeReligion = religion.deserialize().unwrap();
                    if de.color.is_none() {
                        continue;
                    }

                    let de: ReligionBody = religion.deserialize().unwrap();
                    result.push(RawReligion {
                        id: religion_name.to_string(),
                        colors: de.color,
                        allowed_conversions: de.allowed_conversions,
                    });
                }
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    pub fn test_religion_parse() {
        let data = r#"jewish_group = {

            flags_with_emblem_percentage = 33
            flag_emblem_index_range = { 106 107 }
        
            jewish = {
                icon = 20
                color = { 153 25 102 }
                country = {
                    tolerance_own = 2
                    advisor_pool = 1
                }
                country_as_secondary = {
                    advisor_pool = 1
                    advisor_cost = -0.1
                }
                province = {
                    local_missionary_strength = -0.02
                }
                
                heretic = { SAMARITAN KARAITE }
            }
            
            harmonized_modifier = harmonized_jewish_group
            
            crusade_name = HOLY_WAR
            
        }"#;

        let actual = parse_religions(data.as_bytes());
        assert_eq!(
            actual,
            vec![RawReligion {
                id: String::from("jewish"),
                colors: [153, 25, 102],
                allowed_conversions: Vec::new(),
            }]
        );
    }
}
