use jomini::{Windows1252Encoding, text::syntax};
use std::collections::HashMap;

pub fn personalities(data: &[u8]) -> HashMap<String, Vec<String>> {
    let parsed = syntax::parse(data);
    let encoding = Windows1252Encoding::new();
    parsed.document(encoding).check().unwrap();
    let mut result = HashMap::new();

    for personality in parsed.ast().fields() {
        let fields = personality
            .value()
            .and_then(|value| value.as_block())
            .unwrap();
        let mut traits: Vec<String> = Vec::new();
        for field in fields.fields() {
            let Some(value) = field.value() else {
                continue;
            };
            if field.key_is(b"nation_designer_cost") {
                if value.to_i64().unwrap().is_negative() {
                    for trait_name in &mut traits {
                        trait_name.push_str("_opposite");
                    }
                }
            } else if value.as_scalar_token().is_some() || value.as_headered_block().is_some() {
                traits.push(field.key().decode(encoding).into_owned());
            }
        }

        result.insert(personality.key().decode(encoding).into_owned(), traits);
    }

    result
}
