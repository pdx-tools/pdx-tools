use crate::sprites;
use regex::Regex;
use std::collections::HashMap;
use std::path::PathBuf;

pub fn achievement_images(data: &[u8]) -> HashMap<i32, PathBuf> {
    let sprites = sprites::parse_sprites(data);
    let re = Regex::new(r"^GFX_achievement_(\d+)$").unwrap();

    sprites
        .into_iter()
        .filter_map(|sprite| {
            re.captures(&sprite.name)
                .and_then(|cap| cap.get(1))
                .map(|x| x.as_str().parse::<i32>().unwrap())
                .map(|achieve_id| (achieve_id, sprite.texturefile))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_achievements() {
        let data = include_bytes!("../tests/fixtures/interface/achievements.gfx");
        let images = achievement_images(&data[..]);
        let first = images.get(&1).unwrap();
        assert_eq!(
            first,
            &PathBuf::from("gfx//interface//achievements//achievement_for_the_glory.dds")
        );

        let next = images.get(&260).unwrap();
        assert_eq!(
            next,
            &PathBuf::from("gfx/interface/achievements/achievement_dude_where_s_my_boat.dds")
        );
    }
}
