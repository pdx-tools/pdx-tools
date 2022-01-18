use std::collections::HashMap;

pub fn personalities(data: &[u8]) -> HashMap<String, Vec<String>> {
    let tape = jomini::TextTape::from_slice(data).unwrap();
    let mut reader = tape.windows1252_reader();
    let mut result = HashMap::new();

    while let Some((personality, _op, personality_value)) = reader.next_field() {
        let personality = personality.read_string();
        let mut fields = personality_value.read_object().unwrap();

        let mut traits: Vec<String> = Vec::new();
        while let Some((field_name, _op, field_value)) = fields.next_field() {
            let field_name = field_name.read_string();

            if field_name.as_str() == "nation_designer_cost" {
                if field_value
                    .read_scalar()
                    .unwrap()
                    .to_i64()
                    .unwrap()
                    .is_negative()
                {
                    for trai in traits.iter_mut() {
                        trai.push_str("_opposite");
                    }
                }
            } else if field_value.read_str().is_ok() {
                traits.push(field_name);
            }
        }

        result.insert(personality, traits);
    }

    result
}
