use std::error::Error;
use std::fs;
use vic3save::{EnvTokens, Vic3File};

pub fn run(raw_args: &[String]) -> Result<(), Box<dyn Error>> {
    let data = fs::read(raw_args[1].clone())?;
    let file = Vic3File::from_slice(data.as_slice())?;
    let save = file.deserialize_save(&EnvTokens)?;
    let tag = save.get_last_played_country().definition.as_ref();
    let country = save.get_country(tag).expect("tag to be found");

    let gdp_line = country.gdp.iter();
    let sol_line = country.avgsoltrend.iter();
    let pop_line = country.pop_statistics.trend_population.iter();
    for (date, ((gdp, sol), pop)) in gdp_line
        .zip_aligned(sol_line)
        .zip_aligned(pop_line)
        .step_by(52)
    {
        let pop_adj = pop / 100000.0;
        println!(
            "{:?}\t{:0.2}\t{:.2}\t{:.2}",
            date,
            gdp / 1000000.0,
            gdp / pop_adj,
            sol
        );
    }

    Ok(())
}
