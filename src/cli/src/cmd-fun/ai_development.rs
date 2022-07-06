use crate::remote_parse::remote_parse;
use anyhow::Context;
use clap::Args;
use eu4save::{
    query::{NationEventKind, Query},
    CountryTag, PdsDate,
};
use std::{collections::HashSet, path::PathBuf, process::ExitCode};
use walkdir::WalkDir;

/// Produces a csv of how much the AI has devved provinces
#[derive(Args)]
pub struct AiDevelopmentArgs {
    /// Files and directories to parse
    #[clap(action = clap::ArgAction::Append)]
    files: Vec<PathBuf>,
}

impl AiDevelopmentArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let files = self
            .files
            .iter()
            .flat_map(|fp| WalkDir::new(fp).into_iter().filter_map(|e| e.ok()))
            .filter(|e| e.file_type().is_file());

        for file in files {
            let path = file.path();
            let (save, _encoding) = remote_parse(path)
                .with_context(|| format!("unable to parse: {}", path.display()))?;

            if save.meta.multiplayer {
                continue;
            }

            let query = Query::from_save(save);
            let province_owners = query.province_owners();
            let nation_events = query.nation_events(&province_owners);
            let players = query.player_histories(&nation_events);
            let player_tag_switches: HashSet<CountryTag> = players
                .iter()
                .flat_map(|x| {
                    x.history
                        .events
                        .iter()
                        .filter_map(|evt| match evt.kind {
                            NationEventKind::TagSwitch(x) => Some(x),
                            _ => None,
                        })
                        .chain(std::iter::once(x.history.initial))
                })
                .collect();

            let development: i32 = query
                .save()
                .game
                .provinces
                .values()
                .flat_map(|p| p.country_improve_count.iter())
                .filter_map(|(k, v)| (!player_tag_switches.contains(k)).then(|| *v))
                .sum();

            println!(
                "{},{}.{},{},{}",
                path.display(),
                query.save().meta.savegame_version.first,
                query.save().meta.savegame_version.second,
                query.save().meta.date.year(),
                development
            );
        }
        Ok(ExitCode::SUCCESS)
    }
}
