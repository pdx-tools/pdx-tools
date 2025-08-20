use anyhow::bail;
use std::process::Command;

/// Creates an ImageMagick command with the given subcommand.
/// Automatically handles both ImageMagick 7+ ("magick <subcommand>") and ImageMagick 6 ("<subcommand>") installations.
pub fn imagemagick_command(subcommand: &str) -> anyhow::Result<Command> {
    // First try 'magick' command (ImageMagick 7+)
    if Command::new("magick")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
    {
        let mut cmd = Command::new("magick");
        cmd.arg(subcommand);
        return Ok(cmd);
    }

    // Fall back to direct subcommand (ImageMagick 6)
    if Command::new(subcommand)
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
    {
        return Ok(Command::new(subcommand));
    }

    bail!(
        "ImageMagick not found. Please install ImageMagick ('magick {}' or '{}' command)",
        subcommand,
        subcommand
    )
}
