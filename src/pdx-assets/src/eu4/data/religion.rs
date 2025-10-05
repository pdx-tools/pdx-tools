use jomini::{Windows1252Encoding, text::ObjectReader};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, PartialEq)]
pub struct Religion {
    pub group: String,
    pub id: String,
    pub name: String,
    pub colors: [u8; 3],
    pub allowed_conversions: Vec<String>,
}

#[derive(Debug, PartialEq)]
pub struct ReligiousRebels {
    pub religion: String,
    pub negotiate_convert_on_dominant_religion: bool,
    pub force_convert_on_break: bool,
}

#[derive(Debug, PartialEq)]
pub struct RawReligion {
    pub id: String,
    pub group: String,
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
            group: religion.group,
            name: String::from(localization.get(&religion.id).unwrap()),
            id: religion.id,
            colors: religion.colors,
            allowed_conversions: religion.allowed_conversions,
        })
        .collect()
}

pub fn parse_religions(data: &[u8]) -> Vec<RawReligion> {
    let tape = jomini::TextTape::from_slice(data).unwrap();
    let reader = tape.windows1252_reader();
    let mut result = Vec::new();
    for (religion_group_name, _, value) in reader.fields() {
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
                        group: religion_group_name.read_string(),
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

pub fn religion_rebels(data: &[u8]) -> Option<ReligiousRebels> {
    let tape = jomini::TextTape::from_slice(data).unwrap();
    let reader = tape.windows1252_reader();

    let mut negotiate_convert_on_dominant_religion = false;
    let mut force_convert_on_break = false;
    let mut religion = None;
    for (_, _, value) in reader.fields() {
        if let Ok(rebels) = value.read_object() {
            for (key, _, value) in rebels.fields() {
                match key.read_str().as_ref() {
                    "can_negotiate_trigger" => {
                        negotiate_convert_on_dominant_religion =
                            dominant_religion_key(value.read_object().unwrap())
                    }
                    "demands_enforced_effect" => {
                        force_convert_on_break = convert_on_break(value.read_object().unwrap())
                    }
                    "religion" => religion = value.read_string().ok(),
                    _ => {}
                }
            }
        }
    }

    religion.map(|religion| ReligiousRebels {
        negotiate_convert_on_dominant_religion,
        force_convert_on_break,
        religion,
    })
}

fn dominant_religion_key(reader: ObjectReader<Windows1252Encoding>) -> bool {
    for (key, _, value) in reader.fields() {
        if key.read_str() == "dominant_religion" {
            return true;
        } else if let Ok(obj) = value.read_object()
            && dominant_religion_key(obj)
        {
            return true;
        }
    }

    false
}

fn convert_on_break(reader: ObjectReader<Windows1252Encoding>) -> bool {
    for (key, _, value) in reader.fields() {
        if key.read_str() == "change_religion" {
            return true;
        } else if let Ok(obj) = value.read_object()
            && convert_on_break(obj)
        {
            return true;
        }
    }

    false
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
                group: String::from("jewish_group"),
                id: String::from("jewish"),
                colors: [153, 25, 102],
                allowed_conversions: Vec::new(),
            }]
        );
    }

    #[test]
    pub fn test_religion_rebels() {
        let data = r#"confucianism_rebels = {
            religion = confucianism
            can_negotiate_trigger = {
                OR = {
                    religion_group = eastern
                    dominant_religion = confucianism
                }
            }

            demands_enforced_effect = {
                if = {
                    limit = {
                        tag = PAP
                    }
                    add_stability = -1
                }
                else_if = {
                    limit = {
                        NOT = { religion = confucianism }
                        dominant_religion = confucianism
                    }
                    change_religion = confucianism
                    force_converted = yes
                }
            }
        }"#;

        let actual = religion_rebels(data.as_bytes());
        assert_eq!(
            actual,
            Some(ReligiousRebels {
                negotiate_convert_on_dominant_religion: true,
                force_convert_on_break: true,
                religion: String::from("confucianism")
            })
        );
    }

    #[test]
    pub fn test_religion_rebels_must_break() {
        let data = r#"tengri_pagan_reformed_rebels = {
            religion = tengri_pagan_reformed

            can_negotiate_trigger = {
                religion_group = pagan
            }

            demands_enforced_effect = {
                if = {
                    limit = {
                        tag = PAP
                    }
                    add_stability = -1
                }
                else_if = {
                    limit = {
                        dominant_religion = tengri_pagan_reformed
                        NOT = { religion = tengri_pagan_reformed }
                    }
                    change_religion = tengri_pagan_reformed
                    force_converted = yes
                }
            }
        }"#;

        let actual = religion_rebels(data.as_bytes());
        assert_eq!(
            actual,
            Some(ReligiousRebels {
                negotiate_convert_on_dominant_religion: false,
                force_convert_on_break: true,
                religion: String::from("tengri_pagan_reformed")
            })
        );
    }

    #[test]
    pub fn test_religion_rebels_no_break() {
        let data = r#"nahuatl_rebels = {
            religion = nahuatl

            can_negotiate_trigger = {
                religion_group = pagan
            }

            demands_enforced_effect = {
                if = {
                    limit = {
                        tag = PAP
                    }
                    add_stability = -1
                }
            }
        }"#;

        let actual = religion_rebels(data.as_bytes());
        assert_eq!(
            actual,
            Some(ReligiousRebels {
                negotiate_convert_on_dominant_religion: false,
                force_convert_on_break: false,
                religion: String::from("nahuatl"),
            })
        );
    }
}
