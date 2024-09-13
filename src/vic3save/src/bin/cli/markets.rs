use std::error::Error;
use std::fs;
use vic3save::markets::goods_price_based_on_buildings;
use vic3save::{BasicTokenResolver, Vic3File};

pub fn run(raw_args: &[String]) -> Result<(), Box<dyn Error>> {
    let data = fs::read(raw_args[1].clone())?;
    let file = Vic3File::from_slice(data.as_slice())?;
    let file_data = std::fs::read("assets/vic3.txt").unwrap_or_default();
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;
    let save = file.deserialize_save(&resolver)?;
    let tag = save.get_last_played_country().definition.as_ref();
    println!("Market for country {}", tag);
    let country = save.get_country(tag).expect("tag to be found");
    let states = &country.states;
    let goods_prices = goods_price_based_on_buildings(
        save.building_manager
            .database
            .values()
            .filter_map(|x| x.as_ref())
            .filter(|b| states.contains(&b.state)),
    )?;

    for (good, val) in goods_prices {
        println!("{}: {}", good, val);
    }
    Ok(())
}
