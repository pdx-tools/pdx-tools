use crate::utils;
use campaign_analysis::{History, Observation, Query, Selection, Session, View};
use eu4game::analysis::{
    self, CountryDimension, CountryMetric, Eu4Analysis, Eu4Answer, Eu4Query, LineageCell,
    army_size, province_development,
};
use eu4game::game::Game;
use eu4game::shared::Eu4Parser;
use eu4save::ProvinceId;
use eu4save::query::Query as SaveQuery;
use std::collections::{BTreeMap, BTreeSet, HashSet};

const SAVES: [(&str, &str, f64, f64); 3] = [
    ("ita2.eu4", "1528-07-01", 19311.0, 196.0),
    ("ita2_later.eu4", "1528-08-01", 19316.0, 196.0),
    ("ita2_later13.eu4", "1547-03-05", 19888.0, 198.0),
];

/// Genoa, Milan, Venice, Florence, Siena, Rome and Naples.
const ITALY: [u16; 7] = [101, 104, 112, 116, 117, 118, 121];

fn parse(name: &str) -> SaveQuery {
    let data = utils::request(name);
    let out = Eu4Parser::new().parse(&data).unwrap();
    SaveQuery::from_save(out.save)
}

#[test]
fn observations_agree_with_the_parsed_save() {
    let mut campaigns = Vec::new();
    let mut layouts = Vec::new();
    let mut players = Vec::new();
    let mut developments = Vec::new();
    let mut by_religion = Vec::new();
    let mut session = Session::<Eu4Analysis>::new();
    for (name, date, total, italy) in SAVES {
        let query = parse(name);
        let observed = analysis::extract(&query, String::from(name)).unwrap();
        let provinces = &query.save().game.provinces;
        assert_eq!(observed.descriptor.date, date);
        assert_eq!(observed.payload().provinces.len(), provinces.len());
        assert_eq!(
            observed.payload().provinces.columns().development.len(),
            provinces.len()
        );
        assert!(observed.payload().provinces.keys().is_sorted());
        assert_eq!(observed.payload().owned_development(), total, "{name}");

        // Country development comes from the provinces of each owner.
        let player = query.save().meta.player;
        let player_development: f64 = provinces
            .values()
            .filter(|province| province.owner == Some(player))
            .map(|province| f64::from(province_development(province)))
            .sum();
        let mut religions = BTreeMap::<String, f64>::new();
        for province in provinces.values().filter(|x| x.owner == Some(player)) {
            if let Some(religion) = &province.religion {
                *religions.entry(religion.clone()).or_default() +=
                    f64::from(province_development(province));
            }
        }
        by_religion.push(religions);
        developments.push(player_development);
        let row = observed.payload().country_offset(&player).unwrap();
        assert_eq!(
            observed.payload().province_development_by_country()[row],
            Some(player_development)
        );
        let country = query.country(&player).unwrap();
        let columns = observed.payload().countries.columns();
        assert_eq!(
            columns.max_manpower.get(row),
            Some(Some(country.max_manpower))
        );
        assert_eq!(columns.army_size.get(row), Some(Some(army_size(country))));

        // The viewer splits army size by the unit types of the game data. The
        // total needs no game data: every regiment of these saves has a known
        // type, so the split leaves none out.
        let game = Game::new(&query.save().meta.savegame_version);
        let land: HashSet<_> = game.land_units().map(|unit| unit.name).collect();
        let regiments: Vec<_> = query
            .save()
            .game
            .countries
            .iter()
            .flat_map(|(_, country)| &country.armies)
            .filter(|army| army.mercenary_company.is_none())
            .flat_map(|army| &army.regiments)
            .collect();
        assert!(regiments.len() > 1000, "{name}");
        assert!(
            regiments.iter().all(|x| land.contains(x._type.as_str())),
            "{name}"
        );

        let mut italy_total = 0.0;
        for id in ITALY {
            let row = observed
                .payload()
                .provinces
                .row(&ProvinceId::new(i32::from(id)))
                .unwrap();
            italy_total += f64::from(
                *observed
                    .payload()
                    .provinces
                    .value(row, |c| &c.development)
                    .unwrap(),
            );
        }
        assert_eq!(italy_total, italy, "{name}");

        // The store reads the binary form that JavaScript moves.
        let bytes = observed.encode();
        let decoded = Observation::<Eu4Analysis>::decode(&bytes).unwrap();
        assert_eq!(decoded.payload(), observed.payload());
        session.append(0, &bytes, usize::MAX).unwrap();
        let stored = session.snapshot(&observed.descriptor.id).unwrap();
        assert_eq!(stored.encode(), bytes);
        players.push(player);
        campaigns.push(observed.descriptor.campaign_id);
        layouts.push(observed.descriptor.layout_key);
    }

    assert!(campaigns.iter().all(|id| id == &campaigns[0]));
    assert!(layouts.iter().all(|key| key == &layouts[0]));

    // The store answers with the same totals.
    let view = View::select(session.store(), &campaigns[0], &Selection::All);
    let rows = |query: Eu4Query| {
        let (Eu4Answer::WorldDevelopment(History { rows })
        | Eu4Answer::ProvinceDevelopment(History { rows })) = query.answer(&view)
        else {
            panic!("history");
        };
        rows.into_iter()
            .map(|row| (row.date, row.value))
            .collect::<Vec<_>>()
    };
    let expected = |pick: fn(&(&str, &str, f64, f64)) -> f64| {
        SAVES
            .iter()
            .map(|save| (save.1.to_owned(), Some(pick(save))))
            .collect::<Vec<_>>()
    };
    assert_eq!(rows(Eu4Query::WorldDevelopment), expected(|save| save.2));
    assert_eq!(
        rows(Eu4Query::ProvinceDevelopment {
            province_ids: ITALY.map(|id| ProvinceId::from(i32::from(id))).to_vec()
        }),
        expected(|save| save.3)
    );

    assert_eq!(session.memory().layouts, 3);

    // The player's series agree with its provinces in each save.
    let player = players[0];
    assert!(players.iter().all(|x| *x == player));
    let Eu4Answer::CountrySeries(development) = (Eu4Query::CountrySeries {
        tags: vec![player],
        metric: CountryMetric::ProvinceDevelopment,
    })
    .answer(&view) else {
        panic!("country series");
    };
    // The player formed Italy, so its tag is not the first of the lineage.
    let held = development[0]
        .lineage
        .tags()
        .iter()
        .position(|x| x.tag == player)
        .unwrap();
    assert_eq!(
        development[0].values,
        developments
            .iter()
            .map(|&value| Some(LineageCell::Value {
                tag: player,
                held,
                value,
            }))
            .collect::<Vec<_>>()
    );
    let Eu4Answer::CountryBreakdown(religions) = (Eu4Query::CountryBreakdown {
        tag: player,
        dimension: CountryDimension::Religion,
    })
    .answer(&view) else {
        panic!("country breakdown");
    };
    let names: BTreeSet<_> = by_religion.iter().flat_map(|x| x.keys()).collect();
    assert_eq!(
        religions.iter().map(|x| &x.key).collect::<BTreeSet<_>>(),
        names
    );
    for series in &religions {
        let expected: Vec<_> = by_religion
            .iter()
            .map(|totals| {
                let total = totals.get(&series.key).copied().unwrap_or(0.0);
                Some(f64::from(total as f32))
            })
            .collect();
        assert_eq!(series.values, expected, "{}", series.key);
    }
}

#[test]
fn metadata_hints_do_not_split_a_campaign() {
    let first = parse("arda-shahansha.eu4");
    let second = parse("arda-persia.eu4");
    assert_ne!(
        first.save().meta.campaign_id,
        second.save().meta.campaign_id
    );
    assert_eq!(
        analysis::extract(&first, String::from("a"))
            .unwrap()
            .descriptor
            .campaign_id,
        analysis::extract(&second, String::from("b"))
            .unwrap()
            .descriptor
            .campaign_id
    );
}

#[test]
fn an_upload_has_the_snapshot_of_its_file() {
    // The server keeps the file that the browser uploads, which the browser
    // compresses again.
    let data = utils::request("ita2_later.eu4");
    let stored = pdx_save_codec::Compression::new(data.clone())
        .unwrap()
        .compress()
        .unwrap();
    assert_ne!(stored, data);
    let observe = |data: &[u8]| {
        let out = Eu4Parser::new().with_hash(true).parse(data).unwrap();
        analysis::extract(&SaveQuery::from_save(out.save), out.hash.unwrap()).unwrap()
    };
    let file = observe(&data);
    let upload = observe(&stored);
    assert_eq!(upload.descriptor, file.descriptor);
    assert_eq!(upload.encode(), file.encode());
}
