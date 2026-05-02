use crate::Game;
use anyhow::{Context, Result, anyhow};
use clap::{Args, ValueEnum};
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::{Command, ExitCode};

/// Download a support asset game using SteamCMD
#[derive(Args, Debug)]
pub struct FetchGameArgs {
    /// Game to download (eu4 or eu5)
    #[clap(long)]
    game: Game,

    /// Steam beta branch to download. Omit for the public/default branch
    #[clap(long)]
    branch: Option<String>,

    /// Exact install directory. Defaults to assets/steam/<game>/<branch-or-public>
    #[clap(long)]
    install_dir: Option<PathBuf>,

    /// Steam username. If omitted, STEAM_USERNAME is used
    #[clap(long)]
    username: Option<String>,

    /// Steam platform to request
    #[clap(long, value_enum, default_value_t = SteamPlatform::Windows)]
    platform: SteamPlatform,

    /// Skip SteamCMD validation after download
    #[clap(long)]
    no_validate: bool,

    /// Print the SteamCMD invocation without running it
    #[clap(long)]
    dry_run: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum SteamPlatform {
    Windows,
    Linux,
    Macos,
}

impl SteamPlatform {
    fn steamcmd_value(self) -> &'static str {
        match self {
            SteamPlatform::Windows => "windows",
            SteamPlatform::Linux => "linux",
            SteamPlatform::Macos => "macos",
        }
    }
}

impl FetchGameArgs {
    pub fn run(&self) -> Result<ExitCode> {
        let mut request = SteamCmdRequest::from_args(self)?;
        request.install_dir = absolute_install_dir(&request.install_dir)?;

        if self.dry_run {
            println!("{}", request.display_command());
            return Ok(ExitCode::SUCCESS);
        }

        let install_parent = request.install_dir.parent().with_context(|| {
            format!(
                "Install directory has no parent: {}",
                request.install_dir.display()
            )
        })?;
        std::fs::create_dir_all(install_parent).with_context(|| {
            format!(
                "Failed to create install parent: {}",
                install_parent.display()
            )
        })?;

        let mut command = request.command();
        let status = command
            .status()
            .context("Failed to execute steamcmd. Is SteamCMD installed?")?;

        if !status.success() {
            return Ok(ExitCode::FAILURE);
        }

        anyhow::ensure!(
            install_dir_has_contents(&request.install_dir)?,
            "SteamCMD exited successfully, but no files were found in {}",
            request.install_dir.display()
        );

        Ok(ExitCode::SUCCESS)
    }
}

#[derive(Debug, Eq, PartialEq)]
struct SteamCmdRequest {
    game: Game,
    branch: Option<String>,
    install_dir: PathBuf,
    username: String,
    platform: SteamPlatform,
    validate: bool,
}

impl SteamCmdRequest {
    fn from_args(args: &FetchGameArgs) -> Result<Self> {
        let username = match args.username.as_ref() {
            Some(username) if !username.trim().is_empty() => username.trim().to_owned(),
            Some(_) => anyhow::bail!("Steam username cannot be empty"),
            None => {
                let username = std::env::var("STEAM_USERNAME")
                    .map_err(|_| anyhow!("Provide --username or set STEAM_USERNAME"))?;
                let username = username.trim();
                anyhow::ensure!(!username.is_empty(), "STEAM_USERNAME cannot be empty");
                username.to_owned()
            }
        };

        let branch = args
            .branch
            .as_ref()
            .map(|x| x.trim())
            .filter(|x| !x.is_empty())
            .map(str::to_owned);

        let install_dir = args.install_dir.clone().unwrap_or_else(|| {
            PathBuf::from("assets")
                .join("steam")
                .join(args.game.to_string())
                .join(
                    branch
                        .as_deref()
                        .map(sanitize_path_component)
                        .unwrap_or_else(|| String::from("public")),
                )
        });

        Ok(Self {
            game: args.game,
            branch,
            install_dir,
            username,
            platform: args.platform,
            validate: !args.no_validate,
        })
    }

    fn command(&self) -> Command {
        let mut command = Command::new("steamcmd");
        command.args(self.args());
        command
    }

    fn args(&self) -> Vec<OsString> {
        let mut args = vec![
            OsString::from("+@sSteamCmdForcePlatformType"),
            OsString::from(self.platform.steamcmd_value()),
            OsString::from("+force_install_dir"),
            self.install_dir.as_os_str().to_owned(),
            OsString::from("+login"),
            OsString::from(&self.username),
            OsString::from("+app_update"),
            OsString::from(self.game.steam_app_id().to_string()),
        ];

        args.push(OsString::from("-beta"));
        args.push(OsString::from(self.branch.as_deref().unwrap_or("public")));

        if self.validate {
            args.push(OsString::from("validate"));
        }

        args.push(OsString::from("+quit"));
        args
    }

    fn display_command(&self) -> String {
        std::iter::once(OsString::from("steamcmd"))
            .chain(self.args())
            .map(|x| shell_display(&x))
            .collect::<Vec<_>>()
            .join(" ")
    }
}

fn sanitize_path_component(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    let mut last_was_underscore = false;

    for ch in value.chars() {
        let safe = ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_');
        if safe {
            sanitized.push(ch);
            last_was_underscore = false;
        } else if !last_was_underscore {
            sanitized.push('_');
            last_was_underscore = true;
        }
    }

    let sanitized = sanitized.trim_matches('_');
    if sanitized.is_empty() {
        String::from("branch")
    } else {
        sanitized.to_owned()
    }
}

fn absolute_install_dir(path: &std::path::Path) -> Result<PathBuf> {
    if path.is_absolute() {
        Ok(path.to_owned())
    } else {
        Ok(std::env::current_dir()
            .context("Failed to determine current directory")?
            .join(path))
    }
}

fn install_dir_has_contents(path: &std::path::Path) -> Result<bool> {
    match std::fs::read_dir(path) {
        Ok(mut entries) => Ok(entries.next().transpose()?.is_some()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(err).with_context(|| format!("Failed to read {}", path.display())),
    }
}

fn shell_display(value: &OsString) -> String {
    let value = value.to_string_lossy();
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '.' | '-' | '_' | ':' | '='))
    {
        value.into_owned()
    } else {
        format!("'{}'", value.replace('\'', "'\\''"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(game: Game) -> FetchGameArgs {
        FetchGameArgs {
            game,
            branch: None,
            install_dir: None,
            username: Some(String::from("steam-user")),
            platform: SteamPlatform::Windows,
            no_validate: false,
            dry_run: false,
        }
    }

    fn arg_strings(request: &SteamCmdRequest) -> Vec<String> {
        request
            .args()
            .into_iter()
            .map(|x| x.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn maps_games_to_steam_app_ids() {
        let eu4 = SteamCmdRequest::from_args(&args(Game::Eu4)).unwrap();
        let eu5 = SteamCmdRequest::from_args(&args(Game::Eu5)).unwrap();

        assert!(arg_strings(&eu4).contains(&String::from("236850")));
        assert!(arg_strings(&eu5).contains(&String::from("3450310")));
    }

    #[test]
    fn defaults_to_assets_steam_public_install_dir() {
        let request = SteamCmdRequest::from_args(&args(Game::Eu4)).unwrap();

        assert_eq!(
            request.install_dir,
            PathBuf::from("assets/steam/eu4/public")
        );
    }

    #[test]
    fn default_branch_explicitly_requests_public_beta() {
        let request = SteamCmdRequest::from_args(&args(Game::Eu5)).unwrap();
        let strings = arg_strings(&request);

        assert!(strings.windows(2).any(|x| x == ["-beta", "public"]));
    }

    #[test]
    fn branch_adds_beta_args_and_sanitized_install_dir() {
        let mut args = args(Game::Eu5);
        args.branch = Some(String::from("release / 1.0"));

        let request = SteamCmdRequest::from_args(&args).unwrap();
        let strings = arg_strings(&request);

        assert_eq!(
            request.install_dir,
            PathBuf::from("assets/steam/eu5/release_1.0")
        );
        assert!(strings.windows(2).any(|x| x == ["-beta", "release / 1.0"]));
    }

    #[test]
    fn validation_is_enabled_by_default_and_can_be_disabled() {
        let default_request = SteamCmdRequest::from_args(&args(Game::Eu4)).unwrap();
        assert!(arg_strings(&default_request).contains(&String::from("validate")));

        let mut args = args(Game::Eu4);
        args.no_validate = true;
        let request = SteamCmdRequest::from_args(&args).unwrap();
        assert!(!arg_strings(&request).contains(&String::from("validate")));
    }

    #[test]
    fn absolute_install_dir_resolves_relative_paths_under_current_dir() {
        let path = absolute_install_dir(std::path::Path::new("assets/steam/eu4/public")).unwrap();

        assert!(path.is_absolute());
        assert!(path.ends_with("assets/steam/eu4/public"));
    }

    #[test]
    fn detects_missing_or_empty_install_dirs() {
        let temp_dir = tempfile::tempdir().unwrap();
        let missing = temp_dir.path().join("missing");
        assert!(!install_dir_has_contents(&missing).unwrap());
        assert!(!install_dir_has_contents(temp_dir.path()).unwrap());

        std::fs::write(temp_dir.path().join("installed.txt"), b"ok").unwrap();
        assert!(install_dir_has_contents(temp_dir.path()).unwrap());
    }
}
