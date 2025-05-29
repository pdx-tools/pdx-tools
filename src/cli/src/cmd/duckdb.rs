use anyhow::Context;
use clap::Args;
use duckdb::params;
use eu4game::{achievements::AchievementHunter, shared::Eu4Parser};
use eu4save::{eu4_start_date, PdsDate};
use std::{io::Read, path::PathBuf, process::ExitCode};
use walkdir::WalkDir;

/// Produces a delta to apply to database from reparsed saves
#[derive(Args)]
pub struct DuckdbArgs {
    /// Path to duckdb export
    #[arg(short, long)]
    output: PathBuf,

    /// Files and directories to parse
    #[arg(action = clap::ArgAction::Append)]
    files: Vec<PathBuf>,
}

impl DuckdbArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let connection = duckdb::Connection::open(&self.output)?;

        connection.execute_batch(
            "
        CREATE TABLE IF NOT EXISTS saves(
            id VARCHAR NOT NULL,
            playthrough_id VARCHAR NOT NULL,
            date DATE NOT NULL,
            player VARCHAR NOT NULL,
            difficulty VARCHAR NOT NULL,
            patch VARCHAR NOT NULL,
        );

        CREATE TYPE province_event AS ENUM ('owner', 'controller', 'religion', 'hre');
        CREATE TABLE IF NOT EXISTS province_history(
            save_id VARCHAR NOT NULL,
            province_id USMALLINT NOT NULL,
            date DATE NOT NULL,
            event_type province_event NOT NULL,
            event_text VARCHAR,
            event_bool BOOLEAN,
        );

        CREATE TYPE country_event AS ENUM ('capital');
        CREATE TABLE IF NOT EXISTS country_events(
            save_id VARCHAR NOT NULL,
            country_id VARCHAR NOT NULL,
            date DATE NOT NULL,
            event_type country_event NOT NULL,
            event_u16 USMALLINT,
        );",
        )?;

        let files = self
            .files
            .iter()
            .flat_map(|fp| WalkDir::new(fp).into_iter().filter_map(|e| e.ok()))
            .filter(|e| e.file_type().is_file())
            .filter(|e| e.path().extension().is_none());

        let mut file_data = Vec::new();

        for file in files {
            let path = file.path();

            let Some(save_id) = path.file_name().and_then(|x| x.to_str()).map(String::from) else {
                continue;
            };

            let mut file = std::fs::File::open(path)
                .with_context(|| format!("unable to open: {}", path.display()))?;

            file_data.clear();
            file.read_to_end(&mut file_data)
                .with_context(|| format!("unable to read: {}", path.display()))?;

            let output = Eu4Parser::new().parse(&file_data)?;
            let save = output.save;

            if save.game.start_date != eu4_start_date() || save.meta.savegame_version.second != 37 {
                println!("Skipped: {}", path.display());

                continue;
            }

            let query = eu4save::query::Query::from_save(save);
            let province_owners = query.province_owners();
            let nation_events = query.nation_events(&province_owners);
            let player_histories = query.player_histories(&nation_events);
            let playthrough_id = eu4game::shared::playthrough_id(&query);

            let game = eu4game::game::Game::new(&query.save().meta.savegame_version);
            let achievements =
                AchievementHunter::create(output.encoding, &query, &game, &player_histories);

            if achievements.is_none() {
                println!("Skipped: {}", path.display());
                continue;
            }

            let patch = format!(
                "{}.{}",
                query.save().meta.savegame_version.first,
                query.save().meta.savegame_version.second
            );
            let difficulty = format!(
                "{:?}",
                query.save().game.gameplay_settings.options.difficulty
            );
            connection.execute(
                "INSERT INTO saves(id, playthrough_id, difficulty, date, player, patch) VALUES(?, ?, ?, ?, ?, ?)",
                duckdb::params![
                    &save_id,
                    &playthrough_id,
                    &difficulty,
                    &query.save().meta.date.iso_8601().to_string(),
                    &query.save().meta.player.as_str(),
                    &patch
                ],
            )?;

            // let reader = RecordBatchIterator::new(vec![Ok(batch)], schema_ref);

            let mut appender = connection.appender("province_history")?;

            for (prov_id, province) in query.save().game.provinces.iter() {
                if let Some(owner) = province.history.owner.as_ref() {
                    appender.append_row(params![
                        &save_id,
                        prov_id.as_u16(),
                        "1-1-1",
                        "owner",
                        owner.as_str(),
                        None::<bool>,
                    ])?;
                }

                if let Some(religion) = province.history.religion.as_ref() {
                    appender.append_row(params![
                        &save_id,
                        prov_id.as_u16(),
                        "1-1-1",
                        "religion",
                        religion.as_str(),
                        None::<bool>,
                    ])?;
                }

                if province.history.hre {
                    appender.append_row(params![
                        &save_id,
                        prov_id.as_u16(),
                        "1-1-1",
                        "hre",
                        None::<String>,
                        true,
                    ])?;
                }

                for (date, evt) in &province.history.events {
                    match evt {
                        eu4save::models::ProvinceEvent::Hre(hre) => {
                            appender.append_row(params![
                                &save_id,
                                prov_id.as_u16(),
                                date.iso_8601().to_string(),
                                "hre",
                                None::<String>,
                                hre,
                            ])?;
                        }
                        eu4save::models::ProvinceEvent::Owner(country_tag) => {
                            appender.append_row(params![
                                &save_id,
                                prov_id.as_u16(),
                                date.iso_8601().to_string(),
                                "owner",
                                country_tag.as_str(),
                                None::<bool>,
                            ])?;
                        }
                        eu4save::models::ProvinceEvent::Controller(country_tag) => {
                            appender.append_row(params![
                                &save_id,
                                prov_id.as_u16(),
                                date.iso_8601().to_string(),
                                "controller",
                                country_tag.tag.as_str(),
                                None::<bool>,
                            ])?;
                        }
                        eu4save::models::ProvinceEvent::Religion(religion) => {
                            appender.append_row(params![
                                &save_id,
                                prov_id.as_u16(),
                                date.iso_8601().to_string(),
                                "religion",
                                religion.as_str(),
                                None::<bool>,
                            ])?;
                        }
                        _ => {}
                    }
                }
            }

            appender.flush()?;

            let mut appender = connection.appender("country_events")?;
            for (country_tag, country) in query.save().game.countries.iter() {
                if let Some(capital) = country.history.capital {
                    appender.append_row(params![
                        &save_id,
                        country_tag.as_str(),
                        "1-1-1",
                        "capital",
                        capital.as_u16(),
                    ])?;
                }

                for (date, evt) in &country.history.events {
                    match evt {
                        eu4save::models::CountryEvent::Capital(prov_id) => {
                            appender.append_row(params![
                                &save_id,
                                country_tag.as_str(),
                                date.iso_8601().to_string(),
                                "capital",
                                prov_id,
                            ])?;
                        }
                        _ => {}
                    }
                }
            }

            println!("Added: {}", path.display());
        }

        Ok(ExitCode::SUCCESS)
    }
}

// This is some apache arrow code that can be used to create something like an enum.
// And I am stashing it here for later reference.
// let mut save_id_builder = StringBuilder::new();
// let mut province_id_builder = UInt16Builder::new();
// let mut date_builder = Date32Builder::new();

// // --- Builders for the DenseUnionArray components for the 'event' column ---
// // Type IDs: 0 for owner, 1 for controller, 2 for religion
// let mut event_type_ids_builder = Int8BufferBuilder::new(0);
// // Value Offsets: The index into the respective child array
// let mut event_value_offsets_builder = Int32BufferBuilder::new(0);

// let mut owner_values_builder = StringBuilder::new();
// let mut controller_values_builder = StringBuilder::new();
// let mut religion_values_builder = StringBuilder::new();

//                 let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
//         // let mut appender = connection.appender("province_history")?;

//         for (prov_id, province) in query.save().game.provinces.iter() {
//             if let Some(owner) = province.history.owner.as_ref() {
//                 save_id_builder.append_value(&save_id);
//                 province_id_builder.append_value(prov_id.as_u16());
//                 date_builder.append_value(
//                     -(epoch - NaiveDate::from_ymd_opt(1, 1, 1).unwrap()).num_days() as i32,
//                 );
//                 event_type_ids_builder.append(0);
//                 event_value_offsets_builder.append(event_value_offsets_builder.len() as i32);
//                 owner_values_builder.append_value(owner.as_str());
//             }
//         }

//         // --- Build the child arrays for the union ---
//         let owner_array = Arc::new(owner_values_builder.finish()) as ArrayRef;
//         let controller_array = Arc::new(controller_values_builder.finish()) as ArrayRef;
//         let religion_array = Arc::new(religion_values_builder.finish()) as ArrayRef;

//         let event_children_arrays = vec![owner_array, controller_array, religion_array];

//         // --- Build the type_id and offset buffers for the union ---
//         let event_type_id_buffer = event_type_ids_builder.finish();
//         let event_value_offset_buffer = event_value_offsets_builder.finish();
//         // let event_null_buffer = event_null_buffer_builder.finish_cloned(); // Cloned if you need builder later

//         // --- Define the Arrow Schema ---
//         // Field definitions for the union variants (must match DuckDB's UNION field names)
//         let union_variant_fields = Fields::from(vec![
//             Field::new("owner", DataType::Utf8, false),
//             Field::new("controller", DataType::Utf8, false),
//             Field::new("religion", DataType::Utf8, false),
//         ]);

//         // Type codes for the union variants (0, 1, 2 in this case)
//         // These correspond to the indices in `event_children_arrays` and values in `event_type_id_buffer`.
//         let union_type_codes: Vec<i8> = (0..union_variant_fields.len() as i8).collect();

//         let event_data_type = DataType::Union(
//             UnionFields::new(
//                 union_type_codes.clone(),
//                 vec![
//                     Field::new("owner", DataType::Utf8, true),
//                     Field::new("controller", DataType::Utf8, true),
//                     Field::new("religion", DataType::Utf8, true),
//                 ],
//             ),
//             UnionMode::Dense,
//         );

//         let schema = Arc::new(Schema::new(vec![
//             Field::new("save_id", DataType::Utf8, false), // Assuming not nullable
//             Field::new("province_id", DataType::UInt16, false), // Assuming not nullable
//             Field::new("date", DataType::Date32, false),  // Not nullable
//             Field::new("event", event_data_type.clone(), false), // The 'event' union column itself can be nullable
//         ]));

//         // --- Construct the DenseUnionArray for the 'event' column ---
//         let event_union_array = UnionArray::try_new(
//             UnionFields::new(
//                 union_type_codes,
//                 vec![
//                     Field::new("owner", DataType::Utf8, true),
//                     Field::new("controller", DataType::Utf8, true),
//                     Field::new("religion", DataType::Utf8, true),
//                 ],
//             ),
//             event_type_id_buffer.into(),
//             Some(event_value_offset_buffer.into()),
//             event_children_arrays,
//         )?;

//         // --- Build the RecordBatch ---
//         let batch = RecordBatch::try_new(
//             schema.clone(),
//             vec![
//                 Arc::new(save_id_builder.finish()),
//                 Arc::new(province_id_builder.finish()),
//                 Arc::new(date_builder.finish()),
//                 Arc::new(event_union_array),
//             ],
//         )?;

//         let schema_ref = batch.schema();

//             // 4. Create an IPC file writer
// // IpcWriteOptions can be used to configure metadata version, compression, etc.
// // let mut file = std::fs::File::create("/tmp/out.arrow").unwrap();
// // let options = IpcWriteOptions::default();
// // let mut writer = FileWriter::try_new(&mut file, &schema)?;

// // // 5. Write the RecordBatch to the file
// // writer.write(&batch)?;

// // // 6. Close the writer to finalize the file
// // writer.finish()?;
