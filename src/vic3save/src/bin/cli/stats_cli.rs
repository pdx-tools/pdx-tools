use std::error::Error;
use std::fs;
use vic3save::stats::Vic3CountryStatsRateIter;
use vic3save::{EnvTokens, Vic3File};

pub fn run(raw_args: &[String]) -> Result<(), Box<dyn Error>> {
    let data = fs::read(raw_args[1].clone())?;
    let file = Vic3File::from_slice(data.as_slice())?;
    let save = file.deserialize_save(&EnvTokens)?;
    let tag = save.get_last_played_country().definition.as_ref();
    let country = save.get_country(tag).expect("tag to be found");

    let gdp_line = country.gdp.iter();
    let sol_line = country.avgsoltrend.iter();
    let pop_line = || country.pop_statistics.trend_population.iter();
    let gdpc_line = || {
        pop_line()
            .zip_aligned(country.gdp.iter())
            .map(|(date, (pop, gdp))| (date, (gdp / (pop / 100_000.0))))
    };
    let gdpc_growth = Vic3CountryStatsRateIter::new(gdpc_line(), 365);
    for (date, [gdp, gdp_growth, sol, gdpc, gdpc_growth]) in gdp_line
        .zip_aligned(country.gdp.gdp_growth())
        .zip_aligned(sol_line)
        .zip_aligned(gdpc_line())
        .zip_aligned(gdpc_growth)
        .flat()
    {
        println!(
            "{:?}\t{:.2}\t{:0.2}\t{:.2}\t{:.2}\t{:0.2}",
            date,
            gdp / 1000000.0,
            gdp_growth,
            gdpc,
            sol,
            gdpc_growth,
        );
    }

    Ok(())
}
