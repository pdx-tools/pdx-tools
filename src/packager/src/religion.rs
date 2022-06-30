use std::collections::HashMap;

#[derive(Debug, PartialEq)]
pub struct Religion {
    pub id: String,
    pub name: String,
    pub colors: [u8; 3],
}

#[derive(Debug, PartialEq)]
pub struct RawReligion {
    pub id: String,
    pub colors: [u8; 3],
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
                    for (key, _, value) in religion.fields() {
                        if key.read_str() == "color" {
                            let mut color = [0u8; 3];
                            let colors = value.read_array().unwrap();
                            for (channel, reader) in color.iter_mut().zip(colors.values()) {
                                *channel = reader.read_scalar().unwrap().to_u64().unwrap() as u8;
                            }

                            result.push(RawReligion {
                                id: religion_name.to_string(),
                                colors: color,
                            })
                        }
                    }
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
            }]
        );
    }
}
