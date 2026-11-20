use jomini::{
    Windows1252Encoding,
    text::syntax::{self, Block, Value},
};
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
    let parsed = syntax::parse(data);
    let encoding = Windows1252Encoding::new();
    let doc = parsed.document(encoding);
    doc.check().unwrap();
    let mut result = Vec::new();
    for group in doc.root().fields() {
        let Some(block) = group.value().and_then(|value| value.as_block()) else {
            continue;
        };
        for field in block.fields() {
            let Some(value @ Value::Block(religion)) = field.value() else {
                continue;
            };
            if religion.get(b"color").is_some() {
                let body: ReligionBody = doc.deserialize_value(value).unwrap();
                result.push(RawReligion {
                    group: group.key().decode(encoding).into_owned(),
                    id: field.key().decode(encoding).into_owned(),
                    colors: body.color,
                    allowed_conversions: body.allowed_conversions,
                });
            }
        }
    }

    result
}

pub fn religion_rebels(data: &[u8]) -> Option<ReligiousRebels> {
    let parsed = syntax::parse(data);
    let encoding = Windows1252Encoding::new();
    let doc = parsed.document(encoding);
    doc.check().unwrap();

    let mut negotiate_convert_on_dominant_religion = false;
    let mut force_convert_on_break = false;
    let mut religion = None;
    for rebels in doc
        .root()
        .fields()
        .filter_map(|field| field.value()?.as_block())
    {
        for field in rebels.fields() {
            let Some(value) = field.value() else {
                continue;
            };
            match field.key().as_bytes() {
                b"can_negotiate_trigger" => {
                    negotiate_convert_on_dominant_religion =
                        contains_key(value.as_block().unwrap(), b"dominant_religion");
                }
                b"demands_enforced_effect" => {
                    force_convert_on_break =
                        contains_key(value.as_block().unwrap(), b"change_religion");
                }
                b"religion" => religion = value.decode(encoding).map(|name| name.into_owned()),
                _ => {}
            }
        }
    }

    religion.map(|religion| ReligiousRebels {
        negotiate_convert_on_dominant_religion,
        force_convert_on_break,
        religion,
    })
}

fn contains_key(block: Block<'_, '_>, key: &[u8]) -> bool {
    block.fields().any(|field| {
        field.key_is(key)
            || field
                .value()
                .and_then(|value| value.as_block())
                .is_some_and(|block| contains_key(block, key))
    })
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
