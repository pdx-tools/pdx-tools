use crate::FileProvider;
use anyhow::{Context, Result};

pub fn extract_game_version<P: FileProvider>(provider: &P) -> Result<String> {
    let branch_text = provider.read_to_string("caesar_branch.txt")?;
    parse_game_version(&branch_text)
}

fn parse_game_version(branch_text: &str) -> Result<String> {
    // Expected format: "release/1.1.0"
    // Extract version after "release/"
    let version = branch_text
        .trim()
        .strip_prefix("release/")
        .context("branch text does not start with 'release/'")?;

    // Split by '.' and take major.minor (first two components)
    let major_minor: Vec<_> = version.split('.').take(2).collect();
    let game_version = major_minor.join(".");

    Ok(game_version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version_basic() {
        let version = parse_game_version("release/1.1.0\n").unwrap();
        assert_eq!(version, "1.1");
    }
}
