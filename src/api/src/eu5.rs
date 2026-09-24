use axum::{Json, body::Bytes, http::StatusCode};
use eu5app::{Eu5AnySaveLoader, Eu5DateComponents, SaveCheckSummer};
use eu5save::models::GameVersion;
use schemas::resolver::Eu5FlatTokens;
use serde::Serialize;
use std::rc::Rc;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Eu5Metadata {
    version: GameVersion,
    date: Eu5DateComponents,
    playthrough_id: String,
    playthrough_name: String,
    /// Content hash of the save. See [`eu5app::SaveCheckSummer`].
    hash: String,
    /// Human player names in save order. Empty for observer games. More
    /// than one name means a multiplayer save.
    players: Vec<String>,
    /// The country of a single-player save. Absent for observer and
    /// multiplayer saves.
    player_country: Option<PlayerCountry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerCountry {
    tag: String,
    /// Coat of arms key for the pre-rendered flag. It is the tag when the
    /// country has no coat of arms of its own.
    flag: String,
    /// The country's name as the save wrote it. Older saves do not have it.
    name: Option<String>,
}

#[tracing::instrument(name = "eu5.parse", skip(data), fields(request_bytes = data.len()))]
pub async fn metadata(data: Bytes) -> Result<Json<Eu5Metadata>, StatusCode> {
    let result = tokio::task::block_in_place(|| parse_metadata(&data));
    result.map(Json).map_err(|error| {
        tracing::warn!(%error, "EU5 metadata parsing failed");
        StatusCode::BAD_REQUEST
    })
}

fn parse_metadata(data: &[u8]) -> anyhow::Result<Eu5Metadata> {
    let loader = Eu5AnySaveLoader::open_with(data, Eu5FlatTokens::new(), SaveCheckSummer::new())?;
    let metadata = loader.meta();
    let mut save = loader.parse()?;
    let game = save.take_gamestate();
    let players = player_names(&game);
    let metadata = Rc::unwrap_or_clone(metadata);
    let player_country = player_country(&game, metadata.player_country_name);
    let hash = save.into_observer().finish();
    Ok(Eu5Metadata {
        version: metadata.version,
        date: metadata.date,
        playthrough_id: metadata.playthrough_id,
        playthrough_name: metadata.playthrough_name,
        hash,
        players,
        player_country,
    })
}

/// The country of a single-player save. The flag follows the rule the EU5 app
/// uses to pick a flag: the country's coat of arms, else its tag.
fn player_country(
    game: &eu5save::models::Gamestate<'_>,
    name: Option<String>,
) -> Option<PlayerCountry> {
    let [player] = game.played_countries else {
        return None;
    };
    let entry = game.countries.index(game.countries.get(player.country)?);
    let tag = entry.tag().to_str().to_owned();
    let flag = entry
        .data()
        .and_then(|data| data.flag.as_ref())
        .map(|flag| flag.to_str().to_owned())
        .unwrap_or_else(|| tag.clone());
    Some(PlayerCountry { tag, flag, name })
}

fn player_names(game: &eu5save::models::Gamestate<'_>) -> Vec<String> {
    game.played_countries
        .iter()
        .map(|p| p.name.to_str().to_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Fetch a save fixture from the CDN into the shared EU5 save cache.
    fn fixture(name: &str) -> Vec<u8> {
        let cache = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../assets/saves/eu5")
            .join(name);
        pdx_assets::http::request_at(format!("eu5-saves/{name}"), cache)
    }

    #[test]
    fn parses_eu5_metadata() {
        let data = fixture("debug-1.0.eu5");
        let metadata = parse_metadata(&data).expect("parse EU5 metadata");
        assert_eq!(metadata.version.major, 1);
        assert!(!metadata.playthrough_name.is_empty());
        assert!(!metadata.playthrough_id.is_empty());
        assert_eq!(metadata.players, vec!["comagoosie".to_string()]);

        let country = metadata.player_country.expect("single-player country");
        assert_eq!(country.tag, "FRA");
        assert_eq!(country.flag, "FRA");
        assert_eq!(country.name.as_deref(), Some("France"));
    }

    #[test]
    fn hash_covers_the_gamestate() {
        let mut data = fixture("debug-1.0.eu5");
        let original = parse_metadata(&data).expect("parse EU5 metadata");

        // Change one byte at the end of the gamestate. The metadata at the
        // start of the file is not affected, so only a hash that covers the
        // gamestate can change.
        let marker = b"comagoosie";
        let tail = &data[data.len() - 64..];
        let at = tail
            .windows(marker.len())
            .rposition(|window| window == marker)
            .expect("player name at the end of the gamestate");
        let at = data.len() - 64 + at + marker.len() - 1;
        data[at] = b'a';
        let altered = parse_metadata(&data).expect("parse altered EU5 metadata");
        assert_eq!(altered.playthrough_name, original.playthrough_name);
        assert_ne!(altered.hash, original.hash);
    }

    #[test]
    fn parses_binary_eu5_metadata() {
        let data = fixture("Clandeboye.eu5");
        let metadata = parse_metadata(&data).expect("parse binary EU5 metadata");
        assert_eq!(metadata.version.major, 1);
        assert!(!metadata.playthrough_name.is_empty());

        // The binary save stores the country name under a token, which must
        // resolve like the other metadata fields.
        let country = metadata.player_country.expect("single-player country");
        assert!(!country.tag.is_empty());
        assert!(country.name.is_some_and(|name| !name.is_empty()));
    }

    #[test]
    fn parses_transcoded_eu5_metadata() {
        let data = fixture("debug-1.0.eu5");
        let original = parse_metadata(&data).expect("parse EU5 metadata");
        let compressed = pdx_save_codec::compress(data).expect("transcode EU5 fixture");
        assert!(compressed.len() < 90 * 1024 * 1024);
        let metadata = parse_metadata(&compressed).expect("parse transcoded EU5 metadata");
        assert_eq!(metadata.version.major, 1);

        // The hash identifies the content, so a transcode must not change it.
        assert_eq!(metadata.hash, original.hash);
    }
}
