use crate::utils;
use eu4game::analysis;
use eu4game::shared::Eu4Parser;
use eu4save::query::Query;

const SAVES: [(&str, &str, f64, f64); 3] = [
    ("ita2.eu4", "1528-07-01", 19311.0, 196.0),
    ("ita2_later.eu4", "1528-08-01", 19316.0, 196.0),
    ("ita2_later13.eu4", "1547-03-05", 19888.0, 198.0),
];

/// Genoa, Milan, Venice, Florence, Siena, Rome and Naples.
const ITALY: [u16; 7] = [101, 104, 112, 116, 117, 118, 121];

fn parse(name: &str) -> Query {
    let data = utils::request(name);
    let out = Eu4Parser::new().parse(&data).unwrap();
    Query::from_save(out.save)
}

#[test]
fn observations_agree_with_the_parsed_save() {
    use analysis::{Eu4Analysis, Eu4SnapshotDescriptor, ProvinceColumns};
    use campaign_analysis::{Selection, SnapshotDescriptor, Store, snapshot_id};
    let mut campaigns = Vec::new();
    let mut layouts = Vec::new();
    let mut store = Store::<Eu4Analysis>::new();
    for (name, date, total, italy) in SAVES {
        let query = parse(name);
        let observed = analysis::extract(&query);
        let provinces = &query.save().game.provinces;
        assert_eq!(observed.date, date);
        assert_eq!(observed.province_ids.len(), provinces.len());
        assert_eq!(observed.development.len(), provinces.len());
        assert_eq!(observed.owned.len(), provinces.len());
        assert!(observed.province_ids.is_sorted());

        assert_eq!(observed.owned_development(), total, "{name}");

        let mut italy_total = 0.0;
        for id in ITALY {
            let row = observed.province_ids.binary_search(&u32::from(id)).unwrap();
            italy_total += f64::from(observed.development[row]);
        }
        assert_eq!(italy_total, italy, "{name}");

        let descriptor = Eu4SnapshotDescriptor {
            common: SnapshotDescriptor {
                id: snapshot_id("eu4", observed.extractor_version, name),
                game: String::from("eu4"),
                campaign_id: observed.campaign_id.clone(),
                content_hash: String::from(name),
                date: observed.date.clone(),
                date_sort: observed.date_sort,
                game_version: observed.game_version.clone(),
                extractor_version: observed.extractor_version,
                artifacts: Vec::new(),
            },
            layout_key: observed.layout_key.clone(),
        };
        let columns = ProvinceColumns {
            development: observed.development,
            owned: observed.owned,
        };
        store
            .append(
                descriptor,
                observed.layout_key.clone(),
                observed.province_ids,
                columns,
                usize::MAX,
            )
            .unwrap();
        campaigns.push(observed.campaign_id);
        layouts.push(observed.layout_key);
    }

    assert!(campaigns.iter().all(|id| id == &campaigns[0]));
    assert!(layouts.iter().all(|key| key == &layouts[0]));

    // The store answers with the same totals.
    let all = Selection::All;
    let italy = ITALY.map(u32::from);
    let rows = |history: campaign_analysis::History| {
        history
            .rows
            .into_iter()
            .map(|row| (row.date, row.value))
            .collect::<Vec<_>>()
    };
    let expected = |pick: fn(&(&str, &str, f64, f64)) -> f64| {
        SAVES
            .iter()
            .map(|save| (save.1.to_owned(), Some(pick(save))))
            .collect::<Vec<_>>()
    };
    assert_eq!(
        rows(analysis::world_development(&store, &campaigns[0], &all)),
        expected(|save| save.2)
    );
    assert_eq!(
        rows(analysis::fixed_province_development(
            &store,
            &campaigns[0],
            &all,
            &italy
        )),
        expected(|save| save.3)
    );
    assert_eq!(store.memory().layouts, 1);
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
        analysis::extract(&first).campaign_id,
        analysis::extract(&second).campaign_id
    );
}
