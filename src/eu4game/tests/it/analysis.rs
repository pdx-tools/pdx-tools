use crate::utils;
use campaign_analysis::{History, Observation, Query, Selection, Series, Session, View};
use eu4game::analysis::{
    self, CountryDimension, CountryMetric, Eu4Analysis, Eu4Answer, Eu4Query, province_development,
};
use eu4game::shared::Eu4Parser;
use eu4save::ProvinceId;
use eu4save::query::Query as SaveQuery;

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
        let row = observed.payload().country_offset(&player).unwrap();
        assert_eq!(
            observed.payload().province_development_by_country()[row],
            player_development
        );
        assert_eq!(
            observed.payload().countries.columns().max_manpower.get(row),
            Some(Some(query.country(&player).unwrap().max_manpower))
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

    // A country breakdown adds up to the development of the country.
    let player = players[0];
    let Eu4Answer::CountrySeries(development) = (Eu4Query::CountrySeries {
        tags: vec![player],
        metric: CountryMetric::ProvinceDevelopment,
    })
    .answer(&view) else {
        panic!("country series");
    };
    let Eu4Answer::CountryBreakdown(religions) = (Eu4Query::CountryBreakdown {
        tag: player,
        dimension: CountryDimension::Religion,
    })
    .answer(&view) else {
        panic!("country breakdown");
    };
    assert!(!religions.is_empty());
    let [Series { values, .. }] = development.as_slice() else {
        panic!("one series");
    };
    for (at, total) in values.iter().enumerate() {
        let sum: f64 = religions
            .iter()
            .map(|series| series.values[at].unwrap())
            .sum();
        assert!((sum - total.unwrap()).abs() < 0.01, "{sum} {total:?}");
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
