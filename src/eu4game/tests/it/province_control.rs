use crate::utils;
use eu4game::province_control::{ProvinceControl, ProvinceTracking};
use eu4game::shared::{Eu4Parser, Eu4SaveOutput};
use eu4save::CountryTag;
use eu4save::query::Query;

#[test]
fn occupations_end_when_a_participant_switched_tags_during_the_war() {
    // BYZ joins wars and then becomes ROM. When these wars end, the
    // occupations of ROM provinces must end.
    let data = utils::request("Basileus.eu4");
    let Eu4SaveOutput { save, .. } = Eu4Parser::new().parse(&data).unwrap();
    let query = Query::from_save(save);
    let province_owners = query.province_owners();
    let nation_events = query.nation_events(&province_owners);
    let tag_resolver = query.tag_resolver(&nation_events);
    let mut control = ProvinceControl::new(
        &query,
        &province_owners,
        &tag_resolver,
        ProvinceTracking::OwnerAndController,
    );

    let end = query.save().meta.date;
    control.advance_to(end);

    let rom = "ROM".parse::<CountryTag>().unwrap();
    let resolver = tag_resolver.at(end);
    let mut stale = Vec::new();
    for (id, province) in &query.save().game.provinces {
        let Some(owner) = province.owner else {
            continue;
        };

        if province.controller.unwrap_or(owner) != rom {
            continue;
        }

        let shown = control.controller(*id).unwrap().current(&resolver);
        if shown != rom {
            stale.push((*id, shown));
        }
    }

    assert_eq!(stale, Vec::new());
}
