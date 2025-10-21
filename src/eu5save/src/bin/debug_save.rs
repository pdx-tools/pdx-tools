use bumpalo_serde::ArenaDeserialize;
use eu5save::{
    BasicTokenResolver, Eu5File, SaveBodyKind, SaveDataKind,
    models::{CountryId, Gamestate, ZipPrelude},
};
use jomini::common::PdsDate;
use std::env;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let file_path = args.get(1).ok_or("Please provide a save file path")?;
    let file_data = std::fs::read("assets/eu5.txt").unwrap_or_default();
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;

    let data = std::fs::read(file_path)?;
    let file = Eu5File::from_slice(&data)?;
    let arena = bumpalo::Bump::new();

    let meta = match file.meta() {
        SaveBodyKind::Text(mut save_body) => {
            ZipPrelude::deserialize_in_arena(&mut save_body.deserializer(), &arena)?
        }
        SaveBodyKind::Binary(mut save_body) => {
            ZipPrelude::deserialize_in_arena(&mut save_body.deserializer(&resolver), &arena)?
        }
    };

    println!(
        "{}.{}.{}",
        meta.metadata.version.major, meta.metadata.version.minor, meta.metadata.version.patch
    );

    let file = std::fs::File::open(file_path)?;
    let start = std::time::Instant::now();
    let file = Eu5File::from_file(file)?;
    match file.kind() {
        eu5save::Eu5FileKind::Uncompressed(SaveDataKind::Text(_)) => {
            println!("Uncompressed text save")
        }
        eu5save::Eu5FileKind::Uncompressed(SaveDataKind::Binary(_)) => {
            println!("Uncompressed binary save")
        }
        eu5save::Eu5FileKind::Zip(x) if file.header().kind().is_binary() => println!(
            "Compressed binary save: {} bytes uncompressed",
            x.gamestate_uncompressed_hint()
        ),
        eu5save::Eu5FileKind::Zip(x) => println!(
            "Compressed text save: {} bytes uncompressed",
            x.gamestate_uncompressed_hint()
        ),
    }

    let save = match file.gamestate()? {
        SaveBodyKind::Text(mut x) => {
            Gamestate::deserialize_in_arena(&mut x.deserializer(), &arena)?
        }
        SaveBodyKind::Binary(mut x) => {
            let mut deser = x.deserializer(&resolver);
            Gamestate::deserialize_in_arena(&mut deser, &arena)?
        }
    };

    println!("Time to parse: {:?}", start.elapsed());

    println!("arena allocated bytes: {}", arena.allocated_bytes());
    println!("{}", save.metadata.date.game_fmt());
    let swe = save.countries.get(CountryId::new(3)).unwrap();
    println!("{:?}", save.countries.index(swe).tag().to_str());
    println!("{:?}", save.countries.index(swe).data());

    if let Some(pc) = &save.played_country {
        println!(
            "{:?} {:?}",
            pc.country,
            save.countries.get_entry(pc.country).unwrap().tag().to_str()
        );

        for dep in save.diplomacy_manager.dependencies() {
            if dep.first == pc.country || dep.second == pc.country {
                println!("{dep:?}");
            }
        }
    }

    println!("Number of pops: {}", save.population.database.len());
    println!("Number of locations: {}", save.locations.len());
    let max_pop_types_in_location = save
        .locations
        .iter()
        .map(|x| x.location().population.pops.len())
        .max();
    println!(
        "Max population types in a location: {}",
        max_pop_types_in_location.unwrap_or(0)
    );
    println!("Number of countries: {}", save.countries.len());
    println!("Max population: {:?}", save.location_max_population());

    let stockholm_idx = save
        .locations
        .get(eu5save::models::LocationId::new(1))
        .unwrap();
    println!(
        "Stockholm population: {:?}",
        save.location_population(save.locations.index(stockholm_idx).location())
    );
    println!(
        "number of wars: {}",
        save.war_manager.database.iter().count()
    );
    println!(
        "total number of battles: {}",
        save.war_manager
            .database
            .iter()
            .map(|w| w.battles.len())
            .sum::<usize>()
    );
    println!(
        "number of units: {}",
        save.unit_manager.database.iter().count()
    );
    println!(
        "number of sub-units: {}",
        save.subunit_manager.database.iter().count()
    );
    println!(
        "number of loans: {}",
        save.loan_manager.database.iter().count()
    );
    println!(
        "number of trades: {}",
        save.trade_manager.database.iter().count()
    );

    // Find the market with the highest market value
    let highest_market_value = save
        .market_manager
        .database
        .iter()
        .max_by(|a, b| a.market_value().total_cmp(&b.market_value()));

    if let Some(market) = highest_market_value {
        println!(
            "Market with highest value: {:?} with value {}",
            market.center,
            market.market_value()
        );
    }
    Ok(())
}
