/*!
1.30 changelog:
 - Sweden is not overpowered
   - Must own and core 4746 - Stargard
   - Must own and core 4745 - Rugen
 - Sons of Carthage:
   - Must own and core the western sicily area
   - Must own and core 4735 - Arborea
 - Mare Nostrum:
   - No longer must own 108 - Verona
   - No longer must own 138 - Zeta
   - No longer must own 1769 - Gorz
   - Must own 4696 - Toulon
   - Must own 4698 - Cephalonia
   - Must own 4699 - Arta
   - Must own 4700 - Lesbos
   - Must own 4701 - Corinth
   - Must own 4705 - Gumulcine
   - Must own 4706 - Tolcu
   - Must own 4729 - Padova
   - Must own 4732 - Terracina
   - Must own 4733 - Molise
   - Must own 4735 - Arborea
   - Must own 4736 - Trapani
   - Must own 4738 - Trieste
   - Must own 4752 - Rijeka
   - Must own 4753 - Zadar
   - Must own 4754 - Kotor
   - Must own 4779 - Gallipoli
 - Disciples of Enlightenment
   - Your country now must also follow mahayana faith
 - Mass Production:
   - Must build furnace if playing with Rule Britannia
   - Must build ramparts
   - Must build soldier_households
   - Must build impressment_offices
   - Must build state_house
 - Great Moravia:
   - Must own and core 4723 - Opole
   - Must own and core 4724 - Pardubice
   - Must own and core 4725 - Jindrichuv Hradec
   - Must own and core 4726 - Ostrava
   - Must own and core 4761 - Traungau
   - Must own and core 4762 - Wienerwald
   - Must own and core 4778 - Gorlitz-Eastern Lusatia
 - Voltaire's Nightmare:
   - 100 countries must be in the HRE
 - Østindisk Kompagni Te
   - The trade company must be in Asia

1.31 changelog:
  - No Trail of Tears:
    - Now requires embracement of industrialization
  - Turning the Tide:
    - Now requires embracement of industrialization
  - A Sun God:
    - Now requires embracement of industrialization
  - The Burgundian Conquest:
    - Lotharingia is now an acceptable tag to complete achievement
  - Back to the Piast
    - Glogow is an acceptable starting nation
    - Opole is an acceptable starting nation
  - Fanatic Collectivist
    - Industrialization now needed to be owned
  - Spaghetti Western
    - Sonora is an acceptable nation switch to
*/
use crate::game::Game;
use eu4save::{
    eu4_start_date,
    models::{Country, Eu4Save, Province, TaxManpowerModifier},
    query::{PlayerHistory, Query},
    CountryTag, Encoding, Eu4Date, PdsDate, ProvinceId,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

macro_rules! broken_invariant {
    ($($arg:tt)*) => {
        debug_assert!(false, $($arg)*);
        eprintln!($($arg)*);
    };
}

#[derive(Debug, Serialize)]
pub struct AchievementCondition {
    completed: bool,
    description: String,
}

impl AchievementCondition {
    pub fn new<V: Into<String>>(completed: bool, desc: V) -> Self {
        AchievementCondition {
            completed,
            description: desc.into(),
        }
    }

    pub fn completed<V: Into<String>>(desc: V) -> Self {
        AchievementCondition {
            completed: true,
            description: desc.into(),
        }
    }

    pub fn failed<V: Into<String>>(desc: V) -> Self {
        AchievementCondition {
            completed: false,
            description: desc.into(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AchievementResult {
    pub id: i32,
    pub conditions: Vec<AchievementCondition>,
}

impl AchievementResult {
    pub fn new(id: i32) -> Self {
        AchievementResult {
            id,
            conditions: Vec::new(),
        }
    }

    pub fn and(&mut self, cond: AchievementCondition) -> &mut Self {
        self.conditions.push(cond);
        self
    }

    pub fn completed(&self) -> bool {
        self.conditions.iter().all(|x| x.completed)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Achievement {
    pub id: i32,
    pub name: String,
    pub description: String,
    pub difficulty: Difficulty,
}

pub fn achievements() -> Vec<Achievement> {
    vec![
        Achievement {
            id: 18,
            name: String::from("Italian Ambition"),
            description: String::from("Form Italy."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 34,
            name: String::from("An early Reich"),
            description: String::from("Form Germany."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 38,
            name: String::from("Basileus"),
            description: String::from("As Byzantium, restore the Roman Empire."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 40,
            name: String::from("A Kaiser not just in name"),
            description: String::from("Enact all reforms in the Holy Roman Empire"),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 42,
            name: String::from("African Power"),
            description: String::from("Own and have cores on all provinces in Africa as Kongo."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 47,
            name: String::from("Ruina Imperii"),
            description: String::from("Dismantle the Holy Roman Empire."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 48,
            name: String::from("World Conqueror"),
            description: String::from("Own or have a subject own the entire world."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 49,
            name: String::from("The Three Mountains"),
            description: String::from("Own or have a subject own the entire world as Ryukyu."),
            difficulty: Difficulty::Insane,
        }, Achievement {
            id: 55,
            name: String::from("Luck of the Irish"),
            description: String::from("Own and have cores on the British Isles as an Irish nation."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 64,
            name: String::from("The Re-Reconquista"),
            description: String::from("As Granada, form Andalusia and reconquer all of Iberia."),
            difficulty: Difficulty::VeryHard,
        }, Achievement{
            id: 69,
            name: String::from("Je maintiendrai"),
            description: String::from("Form the Netherlands as a minor nation starting with Dutch culture. Nice"),
            difficulty: Difficulty::Medium,
        // }, Achievement {
        //     id: 84,
        //     name: String::from("A Manchurian Candidate"),
        //     description: String::from("Start as one of the Jurchen tribes and form Qing."),
        //     difficulty: Difficulty::Hard,
        }, Achievement {
            id: 89,
            name: String::from("Shahanshah"),
            description: String::from("Start as Ardabil and form Persia."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 92,
            name: String::from("Switzerlake"),
            description: String::from("Own 99 provinces as Switzerland while owning no ports."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 93,
            name: String::from("King of Jerusalem"),
            description: String::from("Form the Kingdom of Jerusalem as Cyprus or The Knights."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 105,
            name: String::from("Albania or Iberia"),
            description: String::from("As Albania, own or have a subject own Iberia and the Caucasus."),
            difficulty: Difficulty::VeryHard,
        }, /* Achievement {
            id: 101,
            name: String::from("Gothic Invasion"),
            description: String::from("Start as Theodoro and conquer all Germanic culture provinces in Europe."),
            difficulty: Difficulty::VeryHard,
        },*/ Achievement {
            id: 108,
            name: String::from("The Sun Never Sets on the Indian Empire"),
            description: String::from("Form Hindustan or Bharat and own or have a subject own Cape, London, Hong Kong (Canton) and Ottawa (Kichesipi)."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 109,
            name: String::from("Over a Thousand!"),
            description: String::from("Own 1001 provinces directly."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 110,
            name: String::from("Dracula's Revenge"),
            description: String::from("Start as Wallachia or Moldavia, form Romania and own or have a subject own all of the Balkans."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 118,
            name: String::from("This is Persia!"),
            description: String::from("Form Persia and own Egypt, Anatolia and Greece as core provinces."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 121,
            name: String::from("Baltic Crusader"),
            description: String::from("As Teutonic Order or Livonian Order, own all of Russia as core provinces and convert it to Catholic."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 131,
            name: String::from("Take that, von Habsburgs!"),
            description: String::from("As Hungary, own all of Austria as core provinces."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 134,
            name: String::from("Better than Napoleon"),
            description: String::from("As France, own Vienna, Berlin and Moscow as core provinces."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 135,
            name: String::from("Big Blue Blob"),
            description: String::from("As France, hold 100 European core provinces before 1500."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 155,
            name: String::from("Back to the Piast"),
            description: String::from("As Mazovia or Silesia, form the nation of Poland."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 193,
            name: String::from("A tale of two Families"),
            description: String::from("Starting as Vijayanagar or Bahmanis conquer the other's capital and have them not exist."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 133,
            name: String::from("The Buddhists Strike Back"),
            description: String::from("As Kotte or Kandy, own all of India and convert it to Theravada Buddhism."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 150,
            name: String::from("One Faith!"),
            description: String::from("Have all non-wasteland land provinces in the world be of your religion."),
            difficulty: Difficulty::Insane,
        }, Achievement {
            id: 157,
            name: String::from("Lazarus"),
            description: String::from("As Serbia, own the entire Balkans as core provinces."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 159,
            name: String::from("tatarstan"),
            description: String::from("As Kazan or Nogai, own all Tatar culture group lands."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 160,
            name: String::from("Terra Mariana"),
            description: String::from("As Riga, own the Baltic region as core provinces."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 171,
            name: String::from("Mare Nostrum"),
            description: String::from("Restore the Roman Empire and own the entire Mediterranean and Black Sea coast lines."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 198,
            name: String::from("Not just Pizza"),
            description: String::from("Become a Great Power as Naples."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 208,
            name: String::from("Gold Rush"),
            description: String::from("Starting as a Tartar steppe nomad, form the golden horde before 1500"),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 210,
            name: String::from("Rise of the White Sheep"),
            description: String::from("As Aq Qoyunlu, own Tabriz and have Qara Qoyunlu not exist by 1478."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 233,
            name: String::from("Lessons of Hemmingstedt"),
            description: String::from("As Dithmarschen, hold the provinces of Sjaelland and Holland while Denmark do not exist."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 237,
            name: String::from("Good King René"),
            description: String::from("Start as Provence, form the Kingdom of Jerusalem."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 239,
            name: String::from("Avar Khaganate"),
            description: String::from("Achieve Empire rank and conquer Hungary as Avaria."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 241,
            name: String::from("Great Moravia"),
            description: String::from("Restore the Great Moravian borders as Nitra or Moravia."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 242,
            name: String::from("A Hero's Welcome"),
            description: String::from("Starting as Karaman, form the Sultanate of Rum."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 244,
            name: String::from("Voltaire's Nightmare"),
            description: String::from("Have at least 100 countries (or 75 for 1.29) in the HRE"),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 259,
            name: String::from("Empire of Mann"),
            description: String::from("As Mann, conquer all Islands in the world"),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 275,
            name: String::from("Eat your Greens"),
            description: String::from("Control all Grasslands in Asia as Kale before the age of Absolutism."),
            difficulty: Difficulty::Insane,
        }, Achievement {
            id: 277,
            name: String::from("True Heir of Timur"),
            description: String::from("Starting as a Timurid subject, form the Mughals and conquer India by 1550."),
            difficulty: Difficulty::Insane,
        }, Achievement {
            id: 281,
            name: String::from("Never say Nevers"),
            description: String::from("As Nevers, own the entire France region as core provinces."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 296,
            name: String::from("AEIOU"),
            description: String::from("Complete the Austrian mission tree."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 298,
            name: String::from("Everything's Coming Up Mulhouse"),
            description: String::from("Starting as Mulhouse, become Emperor of the HRE and completely decentralize the Empire."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 299,
            name: String::from("Global Hegemony"),
            description: String::from("Reach 100% Strength as any type of Hegemon."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 300,
            name: String::from("God Tier"),
            description: String::from("Become a Tier 5 Defender of the Faith as a nation that is neither Catholic nor Sunni."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 301,
            name: String::from("Spaghetti Western"),
            description: String::from("Starting as Bologna, become Mexico or Texas."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 302,
            name: String::from("Don't be Cilli"),
            description: String::from("Starting as Cilli, form another nation."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 304,
            name: String::from("Stern des Südens"),
            description: String::from("Form Bavaria starting as München and have your Subject Bremen own Werder."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 305,
            name: String::from("Kingdom of God"),
            description: String::from("Starting as the Papal State, become the Kingdom of God"),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 306,
            name: String::from("Stiff Upper Lippe"),
            description: String::from("As Lippe, own all of the British Isles."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 307,
            name: String::from("On the Rhodes Again"),
            description: String::from("Starting as The Knights, conquer and core Constantinople, Jerusalem and Antioch."),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 321,
            name: String::from("Ultimate Military"),
            description: String::from("As Songhai, have Prussia and Nepal as marches!"),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 324,
            name: String::from("Where are the penguins?"),
            description: String::from("As a Malagasy country, unite Madagascar and hold all the most southern provinces of the world."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 326,
            name: String::from("KHAAAAAAN"),
            description: String::from("Restore the Mongol Empire before the Age of Absolutism."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 327,
            name: String::from("Knights of the Caribbean"),
            description: String::from("As the Knights, own the Caribbean and every island in the Mediterranean. (Colonies are NOT allowed)"),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 328,
            name: String::from("Australia-Hungary"),
            description: String::from("Starting as an Australian tribe unite Australia and subjugate Hungary."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 329,
            name: String::from("Shemot is Not"),
            description: String::from("As a Jewish nation, convert all of Egypt to Jewish while having the Jewish Community Aspect active."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 330,
            name: String::from("One nation to rule them all"),
            description: String::from("As Saruhan, have at least 9 loyal vassals with at least 100 development each."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 331,
            name: String::from("Swahili Persuasion"),
            description: String::from("As Kilwa, convert all of the Moluccas and Indonesia."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 332,
            name: String::from("I don't like Sand"),
            description: String::from("Have the most development while owning no province with terrain other than desert or coastal desert"),
            difficulty: Difficulty::Hard,
        }, Achievement {
            id: 335,
            name: String::from("Atwix Legacy"),
            description: String::from("Have 10 personal unions at the same time."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 336,
            name: String::from("Brick by Brick"),
            description: String::from("Starting as Denmark, enact the Unified Kalmar Monarchy government reform and own the entire Scandinavian region as your cores."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 340,
            name: String::from("Holy Horder"),
            description: String::from("Starting as the Teutonic Order, form the Mongol Empire while have the Holy Horde government reform enacted."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 344,
            name: String::from("Purify the Temple"),
            description: String::from("Starting as Riga, enact the Salvific Plutocracy government reform and raid the heretic church of Rome."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 345,
            name: String::from("Almost Prussian Blue"),
            description: String::from("Starting as the Livonian Order, form Livonia and own the territory of the North German Confederation as core provinces."),
            difficulty: Difficulty::Medium,
        }, Achievement {
            id: 346,
            name: String::from("Hanukkah Mutapa"),
            description: String::from("Starting as Mutapa, convert to Judaism and celebrate a festival."),
            difficulty: Difficulty::Medium,
        },  Achievement {
            id: 10000,
            name: String::from("Form the Roman Empire"),
            description: String::from("Custom achievement where one needs to form the Roman Empire"),
            difficulty: Difficulty::Medium,
        },
    ]
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Difficulty {
    VeryEasy = 0,
    Easy = 1,
    Medium = 2,
    Hard = 3,
    VeryHard = 4,
    Insane = 5,
}

#[derive(Debug)]
pub struct AchievementHunter<'a> {
    query: &'a Query,
    game: &'a Game<'a>,
    patch: (u16, u16),
    save: &'a Eu4Save,
    tag: CountryTag,
    country: &'a Country,
    starting_country: CountryTag,
    self_and_subjects: HashSet<CountryTag>,
}

#[derive(Clone, Serialize, Debug)]
pub struct WeightedScore {
    /// The adjusted score
    pub days: i32,

    /// The adjusted date
    pub date: String,
}

impl WeightedScore {
    pub fn from_save(save: &Eu4Save) -> Option<Self> {
        let patch = &save.meta.savegame_version;
        let raw_days = eu4save::eu4_start_date().days_until(&save.meta.date);
        Self::from_raw_parts(patch.first, patch.second, raw_days)
    }

    pub fn from_raw_parts(major: u16, minor: u16, raw_days: i32) -> Option<Self> {
        let factor = weighted_factor(major, minor)?;

        let days = ((raw_days as f64) * factor).floor() as i32;
        let date = eu4save::eu4_start_date()
            .add_days(days)
            .iso_8601()
            .to_string();
        Some(WeightedScore { days, date })
    }
}

pub fn weighted_factor(major: u16, minor: u16) -> Option<f64> {
    let latest = crate::game::LATEST_MINOR;
    if major != 1 || minor < 29 {
        None
    } else {
        Some(1.0 + f64::from(latest - minor.min(latest)) * 0.1)
    }
}

pub fn valid_patch(major: u16, minor: u16) -> bool {
    weighted_factor(major, minor).is_some()
}

fn owned_and_cored_by(prov: &Province, tag: CountryTag) -> bool {
    let cored = prov.cores.contains(&tag);
    let owned = prov.owner.map_or(false, |owner| owner == tag);
    owned && cored
}

impl<'a> AchievementHunter<'a> {
    pub fn new(encoding: Encoding, query: &'a Query, game: &'a Game) -> Option<Self> {
        let province_owners = query.province_owners();
        let nation_events = query.nation_events(&province_owners);
        let player_histories = query.player_histories(&nation_events);
        AchievementHunter::create(encoding, query, game, &player_histories)
    }

    pub fn create(
        encoding: Encoding,
        query: &'a Query,
        game: &'a Game,
        player_histories: &[PlayerHistory],
    ) -> Option<Self> {
        let save = query.save();
        let mut valid = encoding == Encoding::BinaryZip
            && save.meta.is_ironman
            && !save.meta.multiplayer
            && save.meta.not_observer
            && save.game.achievement_ok;

        let mut current_humans: Vec<_> = query.countries().filter(|x| x.country.human).collect();

        valid &= current_humans.len() == 1;
        let patch = &query.save().meta.savegame_version;
        valid &= query
            .save()
            .game
            .gameplay_settings
            .options
            .tax_manpower_modifier
            == TaxManpowerModifier::Historical;

        valid &= !query.save().meta.is_random_new_world;

        // Protect against users "upgrading" a patch to a later version by comparing against the
        // known number of provinces in a standard game.
        valid &= query.save().game.provinces.len() == game.total_provinces();

        // 1.30 introduced games that have history in the future on the start date. I suppose they
        //   should still be marked valid
        let eu4_start = eu4_start_date();
        let date_gate = if query.save().meta.date == eu4_start {
            eu4_start.add_days(1)
        } else {
            query.save().meta.date
        };

        valid &= query
            .countries()
            .map(|x| x.country)
            .flat_map(|x| x.history.events.iter().map(|(date, _event)| date))
            .all(|x| x <= &date_gate);

        valid &= query
            .save()
            .game
            .previous_wars
            .iter()
            .flat_map(|x| x.history.events.iter().map(|(date, _event)| date))
            .all(|x| x <= &date_gate);

        if !valid {
            return None;
        }

        let human = current_humans.remove(0);

        let mut self_and_subjects: HashSet<_> = human.country.subjects.iter().cloned().collect();
        self_and_subjects.insert(human.tag);

        query
            .starting_country(player_histories)
            .map(|starting_country| AchievementHunter {
                query,
                game,
                patch: (patch.first, patch.second),
                save,
                tag: human.tag,
                country: human.country,
                starting_country,
                self_and_subjects,
            })
    }

    fn normal_start_date(&self) -> AchievementCondition {
        AchievementCondition::new(
            self.save.game.start_date == eu4_start_date(),
            "start date of 1444.11.11",
        )
    }

    fn no_custom_nations(&self) -> AchievementCondition {
        let custom_nation = self
            .save
            .game
            .countries
            .iter()
            .find(|(_, c)| c.custom_nation_points.is_some());
        AchievementCondition::new(custom_nation.is_none(), "no custom nations")
    }

    fn has_not_switched_nation(&self) -> AchievementCondition {
        AchievementCondition::new(
            !self.country.has_switched_nation,
            "must not change nation by playing a released vassal",
        )
    }

    fn owns_core_province(&self, province: &Province) -> bool {
        owned_and_cored_by(province, self.tag)
    }

    fn is_colony(&self, province: &Province) -> bool {
        province.colony_size.is_some()
    }

    fn owns_core_province_id(&self, id: ProvinceId) -> bool {
        let province = self.save.game.provinces.get(&id);
        province.map_or(false, |x| owned_and_cored_by(x, self.tag))
    }

    fn owns_core_province_condition(&self, id: ProvinceId) -> AchievementCondition {
        let province = self.save.game.provinces.get(&id);
        let result = province.map_or(false, |prov| self.owns_core_province(prov));
        let prov_name = province.map(|x| x.name.as_str()).unwrap_or("unknown");
        let desc = format!("{} ({}) owned and cored by player", id, prov_name);
        AchievementCondition::new(result, desc)
    }

    fn owns_or_non_sovereign_subject_of_province(&self, province: &Province) -> bool {
        province
            .owner
            .as_ref()
            .map_or(false, |x| self.self_and_subjects.contains(x))
    }

    fn owns_or_non_sovereign_subject_of_id(&self, id: ProvinceId) -> bool {
        let prov = self.save.game.provinces.get(&id);
        prov.map_or(false, |x| self.owns_or_non_sovereign_subject_of_province(x))
    }

    fn owns_or_non_sovereign_subject_of_id_condition(
        &self,
        id: ProvinceId,
    ) -> AchievementCondition {
        let prov = self.save.game.provinces.get(&id);
        prov.map(|x| self.owns_or_non_sovereign_subject_of(x))
            .unwrap_or_else(|| {
                let desc = format!("{} owned by player or subject", id);
                AchievementCondition::failed(desc)
            })
    }

    fn owns_or_non_sovereign_subject_of(&self, province: &Province) -> AchievementCondition {
        let result = self.owns_or_non_sovereign_subject_of_province(province);
        let desc = format!("\"{}\" owned by player or subject", province.name);
        AchievementCondition::new(result, desc)
    }

    fn all_provs_in_area<T>(&self, area: &str, f: T) -> bool
    where
        T: Fn(&Province) -> bool,
    {
        match self.game.area_provinces(area) {
            Some(mut prov_ids) => {
                prov_ids.all(|prov_id| self.save.game.provinces.get(&prov_id).map_or(false, &f))
            }
            None => {
                broken_invariant!("{} area not recognized", area);
                false
            }
        }
    }

    fn all_provs_in_region<T>(&self, region: &str, f: T) -> bool
    where
        T: Fn(&Province) -> bool,
    {
        match self.game.region_areas(region) {
            Some(mut areas) => areas.all(|a| self.all_provs_in_area(a, &f)),
            None => {
                broken_invariant!("{} region not recognized", region);
                false
            }
        }
    }

    fn all_provs_in_continent<T>(&self, continent: &str, f: T) -> bool
    where
        T: Fn(&Province) -> bool,
    {
        match self.game.continent_provinces(continent) {
            Some(mut prov_ids) => {
                prov_ids.all(|prov_id| self.save.game.provinces.get(&prov_id).map_or(false, &f))
            }
            None => {
                broken_invariant!("{} region not recognized", continent);
                false
            }
        }
    }

    fn is_wasteland_or_empty_province(&self, prov: &Province) -> bool {
        prov.owner.is_none()
    }

    pub fn achievements(&self) -> Vec<AchievementResult> {
        vec![
            self.sun_never_sets_on_the_indian_empire(),
            self.a_tale_of_two_families(),
            self.over_a_thousand(),
            self.italian_ambition(),
            self.buddhists_strike_back(),
            self.one_faith(),
            self.world_conqueror(),
            self.the_three_mountains(),
            self.je_maintiendrai(),
            self.basileus(),
            self.take_that_habsburgs(),
            self.switzerlake(),
            self.great_moravia(),
            self.lessons_of_hemmingstedt(),
            self.voltaires_nightmare(),
            self.an_early_reich(),
            self.never_say_nevers(),
            self.kaiser_not_just_in_name(),
            self.back_to_the_piast(),
            self.baltic_crusader(),
            self.better_than_napolean(),
            self.good_king_rene(),
            self.king_of_jerusalem(),
            self.lazarus(),
            self.luck_of_the_irish(),
            self.mare_nostrum(),
            self.big_blue_blob(),
            self.dont_be_cilli(),
            self.on_the_rhodes_again(),
            self.stiff_upper_lippe(),
            self.spaghetti_western(),
            self.aeiou(),
            self.kingdom_of_god(),
            self.global_hegemony(),
            self.god_tier(),
            self.everythings_coming_up_mulhouse(),
            self.true_heir_of_timur(),
            // self.a_manchurian_candidate(),
            self.ruina_imperii(),
            self.avar_khaganate(),
            self.albania_or_iberia(),
            self.a_heros_welcome(),
            self.rise_of_the_white_sheep(),
            self.eat_your_greens(),
            self.empire_of_mann(),
            self.shahanshah(),
            self.this_is_persia(),
            self.form_rome(),
            self.gold_rush(),
            self.tatarstan(),
            self.african_power(),
            self.stern_des_sudens(),
            self.terra_mariana(),
            self.draculas_revenge(),
            self.ultimate_military(),
            self.where_are_the_penguins(),
            self.khaaaaaan(),
            self.knights_of_the_caribbean(),
            self.australia_hungary(),
            self.shemot_is_not(),
            self.one_nation_to_rule_them_all(),
            self.swahili_persuasion(),
            self.i_dont_like_sand(),
            self.atwix_legacy(),
            self.not_just_pizza(),
            self.re_reqonquista(),
            self.brick_by_brick(),
            self.holy_hoarder(),
            self.purify_the_temple(),
            self.almost_prussian_blue(),
            self.hannukah_mutapa(),
            //            self.gothic_invasion(),
        ]
    }

    pub fn sun_never_sets_on_the_indian_empire(&self) -> AchievementResult {
        let mut result = AchievementResult::new(108);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let correct_tag = AchievementCondition::new(
            self.tag.as_str() == "HIN" || self.tag.as_str() == "BHA",
            format!("play as HIN or BHA (playing as {})", self.tag),
        );

        result
            .and(correct_tag)
            .and(self.owns_or_non_sovereign_subject_of_id_condition(ProvinceId::from(236)))
            .and(self.owns_or_non_sovereign_subject_of_id_condition(ProvinceId::from(1177)))
            .and(self.owns_or_non_sovereign_subject_of_id_condition(ProvinceId::from(667)))
            .and(self.owns_or_non_sovereign_subject_of_id_condition(ProvinceId::from(2585)));
        result
    }

    pub fn a_tale_of_two_families(&self) -> AchievementResult {
        let mut result = AchievementResult::new(193);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.owns_core_province_condition(ProvinceId::from(1948)));
        result.and(self.owns_core_province_condition(ProvinceId::from(541)));

        let vij = "VIJ".parse().unwrap();
        let bah = "BAH".parse().unwrap();

        let main = if self.starting_country == bah && self.tag == bah {
            !self
                .save
                .game
                .provinces
                .iter()
                .any(|(_, prov)| prov.owner.map_or(false, |owner| owner == vij))
        } else if self.starting_country == vij && self.tag == vij {
            !self
                .save
                .game
                .provinces
                .iter()
                .any(|(_, prov)| prov.owner.map_or(false, |owner| owner == bah))
        } else {
            false
        };

        let desc = "playing as either BAH or VIJ and the other doesn't exist";
        result.and(AchievementCondition::new(main, desc));

        result
    }

    pub fn over_a_thousand(&self) -> AchievementResult {
        let mut result = AchievementResult::new(109);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let owned_provinces = self
            .save
            .game
            .provinces
            .iter()
            .map(|(_id, prov)| prov.owner)
            .filter(|x| x.map_or(false, |owner| owner == self.tag))
            .count();

        let desc = format!("directly own 1000 provinces ({} owned)", owned_provinces);
        result.and(AchievementCondition::new(owned_provinces > 1000, desc));
        result
    }

    pub fn italian_ambition(&self) -> AchievementResult {
        let mut result = AchievementResult::new(18);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        let is_italy = self.tag == "ITA".parse().unwrap();
        result.and(AchievementCondition::new(is_italy, "is ITA tag"));
        result
    }

    pub fn buddhists_strike_back(&self) -> AchievementResult {
        let mut result = AchievementResult::new(133);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = matches!(self.starting_country.as_str(), "CEY" | "KND");
        let desc = "started as Kotte or Kandy";
        result.and(AchievementCondition::new(starter, desc));

        let has_all_provinces = if result.completed() {
            [
                "deccan_region",
                "coromandel_region",
                "bengal_region",
                "hindusthan_region",
                "west_india_region",
            ]
            .iter()
            .all(|region| {
                self.all_provs_in_region(region, |province| {
                    province
                        .religion
                        .as_ref()
                        .map_or(false, |religion| religion == "buddhism")
                        && owned_and_cored_by(province, self.tag)
                })
            })
        } else {
            false
        };

        let desc = "India super region owned and cored by country and is buddhist";
        result.and(AchievementCondition::new(has_all_provinces, desc));

        result
    }

    pub fn one_faith(&self) -> AchievementResult {
        let mut result = AchievementResult::new(150);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let same_religion = self
            .country
            .religion
            .as_ref()
            .map_or(false, |country_religion| {
                self.save
                    .game
                    .provinces
                    .values()
                    .filter_map(|x| x.owner.and(x.religion.as_ref()))
                    .all(|x| x == country_religion)
            });

        let desc = "all controllable provinces are the same religion";
        result.and(AchievementCondition::new(same_religion, desc));

        result
    }

    pub fn world_conqueror(&self) -> AchievementResult {
        let mut result = AchievementResult::new(48);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let self_and_non_tributaries: HashSet<&CountryTag> = self
            .self_and_subjects
            .iter()
            .filter(|x| {
                self.query
                    .country(x)
                    .map_or(false, |x| x.tribute_type.is_none())
            })
            .collect();

        let owned = self
            .save
            .game
            .provinces
            .values()
            .filter_map(|x| x.owner)
            .all(|x| self_and_non_tributaries.contains(&x));

        let desc = "only existing countries are self and non-tributary subjects";
        result.and(AchievementCondition::new(owned, desc));
        result
    }

    pub fn the_three_mountains(&self) -> AchievementResult {
        let mut result = AchievementResult::new(49);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        let is_ryu = self.tag == "RYU".parse().unwrap();
        result.and(AchievementCondition::new(is_ryu, "is RYU tag"));

        let self_and_non_tributaries: HashSet<&CountryTag> = self
            .self_and_subjects
            .iter()
            .filter(|x| {
                self.query
                    .country(x)
                    .map_or(false, |x| x.tribute_type.is_none())
            })
            .collect();

        let owned = self
            .save
            .game
            .provinces
            .values()
            .filter_map(|x| x.owner)
            .all(|x| self_and_non_tributaries.contains(&x));

        let desc = "only existing countries are self and non-tributary subjects";
        result.and(AchievementCondition::new(owned, desc));
        result
    }

    pub fn je_maintiendrai(&self) -> AchievementResult {
        let mut result = AchievementResult::new(69);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        let is_ned = self.tag == "NED".parse().unwrap();
        result.and(AchievementCondition::new(is_ned, "is NED tag"));

        let desc = "started out as a nation with dutch primary culture";
        let dutch = self
            .query
            .country(&self.starting_country)
            .map_or(false, |country| {
                country
                    .history
                    .primary_culture
                    .as_ref()
                    .map_or(false, |c| c == "dutch")
            });
        result.and(AchievementCondition::new(dutch, desc));
        result
    }

    pub fn basileus(&self) -> AchievementResult {
        let mut result = AchievementResult::new(38);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "BYZ".parse().unwrap();
        let desc = "started as Byzantium";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "BYZ".parse().unwrap();
        let desc = "currently Byzantium";
        result.and(AchievementCondition::new(playing, desc));

        let has_all_provinces = if result.completed() {
            [
                "morea_area",
                "northern_greece_area",
                "albania_area",
                "macedonia_area",
                "bulgaria_area",
                "thrace_area",
                "hudavendigar_area",
                "aydin_area",
                "germiyan_area",
                "kastamonu_area",
                "ankara_area",
                "karaman_area",
                "rum_area",
                "cukurova_area",
                "dulkadir_area",
            ]
            .iter()
            .all(|area| self.all_provs_in_area(area, |prov| owned_and_cored_by(prov, self.tag)))
        } else {
            false
        };

        result.and(AchievementCondition::new(
            has_all_provinces,
            "owns and cored balkans and anatolia",
        ));
        result
    }

    pub fn take_that_habsburgs(&self) -> AchievementResult {
        let mut result = AchievementResult::new(131);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "HUN".parse().unwrap();
        let desc = "started as Hungary";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "HUN".parse().unwrap();
        let desc = "currently Hungary";
        result.and(AchievementCondition::new(playing, desc));

        let has_all_provinces = if result.completed() {
            [
                "inner_austria_area",
                "austria_proper_area",
                "carinthia_area",
                "tirol_area",
            ]
            .iter()
            .all(|area| self.all_provs_in_area(area, |prov| owned_and_cored_by(prov, self.tag)))
        } else {
            false
        };

        result.and(AchievementCondition::new(
            has_all_provinces,
            "owns and cored austria",
        ));
        result
    }

    pub fn switzerlake(&self) -> AchievementResult {
        let mut result = AchievementResult::new(92);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "SWI".parse().unwrap();
        let desc = "started as Switzerland";
        result.and(AchievementCondition::new(starter, desc));

        let cities = self.country.num_of_cities >= 99;
        let desc = "owns at least 99 cities";
        result.and(AchievementCondition::new(cities, desc));

        let ports = self.country.num_of_total_ports == 0;
        let desc = "owns zero ports";
        result.and(AchievementCondition::new(ports, desc));

        result
    }

    pub fn great_moravia(&self) -> AchievementResult {
        let mut result = AchievementResult::new(241);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let playing = matches!(self.tag.as_str(), "SLO" | "MVA");
        let desc = "currently Nitra or Moravia";
        result.and(AchievementCondition::new(playing, desc));

        let has_all_provinces = if result.completed() {
            let prov_ids = if self.patch >= (1, 30) {
                &[
                    60, 4778, 134, 4762, 4761, 135, 153, 154, 162, 262, 263, 4723, 264, 4726, 265,
                    266, 4725, 4724, 267, 1318, 1763, 1770, 1771, 1772, 1864, 2960, 2966, 2967,
                    2968, 2970, 4126, 4236, 4237, 4238, 4240,
                ][..]
            } else {
                &[
                    60, 134, 135, 153, 154, 162, 262, 263, 264, 265, 266, 267, 1318, 1763, 1770,
                    1771, 1772, 1864, 2960, 2966, 2967, 2968, 2970, 4126, 4236, 4237, 4238, 4240,
                ][..]
            };

            prov_ids.iter().all(|id: &i32| {
                self.save
                    .game
                    .provinces
                    .get(&ProvinceId::from(*id))
                    .map_or(false, |prov| owned_and_cored_by(prov, self.tag))
            })
        } else {
            false
        };

        let desc = "Restore the Great Moravian borders";
        result.and(AchievementCondition::new(has_all_provinces, desc));
        result
    }

    pub fn lessons_of_hemmingstedt(&self) -> AchievementResult {
        let mut result = AchievementResult::new(233);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let dtt = "DTT".parse().unwrap();
        let dan = "DAN".parse().unwrap();
        let starter = self.starting_country == dtt;
        let desc = "started as Dithmarschen";
        result.and(AchievementCondition::new(starter, desc));

        let denmark_nonexistant = if result.completed() {
            !self
                .save
                .game
                .provinces
                .values()
                .any(|x| x.owner.map_or(false, |o| o == dan))
        } else {
            false
        };

        let desc = "Denmark does not exist";
        result.and(AchievementCondition::new(denmark_nonexistant, desc));

        let owns_sjaelland = self
            .save
            .game
            .provinces
            .get(&ProvinceId::from(12))
            .and_then(|x| x.owner)
            .map_or(false, |o| o == dtt);
        result.and(AchievementCondition::new(owns_sjaelland, "owns Sjaelland"));

        let owns_holland = self
            .save
            .game
            .provinces
            .get(&ProvinceId::from(97))
            .and_then(|x| x.owner)
            .map_or(false, |o| o == dtt);
        result.and(AchievementCondition::new(owns_holland, "owns Holland"));

        result
    }

    fn voltaires_nightmare(&self) -> AchievementResult {
        let mut result = AchievementResult::new(244);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        // From eu4 wiki: Since a nation is a member of the HRE if and only if its capital province
        // is in the HRE
        let hre_countries = self
            .query
            .countries()
            .map(|x| x.country)
            .filter(|country| country.num_of_cities >= 1)
            .filter_map(|country| self.save.game.provinces.get(&country.capital))
            .filter(|prov| prov.hre)
            .count();

        if self.patch >= (1, 30) {
            let desc = "100 countries in the HRE";
            result.and(AchievementCondition::new(hre_countries >= 100, desc));
        } else {
            let desc = "75 countries in the HRE";
            result.and(AchievementCondition::new(hre_countries >= 75, desc));
        }

        result
    }

    fn an_early_reich(&self) -> AchievementResult {
        let mut result = AchievementResult::new(34);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        let is_germany = self.tag == "GER".parse().unwrap();
        result.and(AchievementCondition::new(is_germany, "currently Germany"));
        result
    }

    fn kaiser_not_just_in_name(&self) -> AchievementResult {
        let mut result = AchievementResult::new(40);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        let is_hre = self.tag == "HLR".parse().unwrap();
        result.and(AchievementCondition::new(
            is_hre,
            "currently Holy Roman Emperor",
        ));
        result
    }

    fn never_say_nevers(&self) -> AchievementResult {
        let mut result = AchievementResult::new(281);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "NEV".parse().unwrap();
        let desc = "started as Nevers";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "NEV".parse().unwrap();
        let desc = "currently Nevers";
        result.and(AchievementCondition::new(playing, desc));

        let has_provinces = if result.completed() {
            self.all_provs_in_region("france_region", |province| {
                owned_and_cored_by(province, self.tag)
            })
        } else {
            false
        };

        let desc = "owns and cored France region";
        result.and(AchievementCondition::new(has_provinces, desc));
        result
    }

    fn back_to_the_piast(&self) -> AchievementResult {
        let mut result = AchievementResult::new(155);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        if self.patch < (1, 31) {
            let starter = matches!(self.starting_country.as_str(), "MAZ" | "SIL");
            let desc = "started as Silesia or Mazovia";
            result.and(AchievementCondition::new(starter, desc));
        } else {
            let starter = matches!(
                self.starting_country.as_str(),
                "MAZ" | "SIL" | "OPL" | "GLG"
            );
            let desc = "started as Silesia, Mazovia, Opole, or Glogow";
            result.and(AchievementCondition::new(starter, desc));
        }

        let playing = self.tag == "POL".parse().unwrap();
        let desc = "currently Poland";
        result.and(AchievementCondition::new(playing, desc));

        result
    }

    fn baltic_crusader(&self) -> AchievementResult {
        let mut result = AchievementResult::new(121);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = matches!(self.starting_country.as_str(), "LIV" | "TEU");
        let desc = "started as Teutonic Order or Livonian Order";
        result.and(AchievementCondition::new(starter, desc));

        let playing = matches!(self.tag.as_str(), "LIV" | "TEU");
        let desc = "currently Teutonic Order or Livonian Order";
        result.and(AchievementCondition::new(playing, desc));

        let has_all_provinces = if result.completed() {
            ["russia_region", "ural_region", "crimea_region"]
                .iter()
                .all(|x| {
                    self.all_provs_in_region(x, |province| {
                        province
                            .religion
                            .as_ref()
                            .map_or(false, |religion| religion == "catholic")
                            && owned_and_cored_by(province, self.tag)
                    })
                })
        } else {
            false
        };

        let desc = "Own and core all provinces in the Pontic Steppe, Russia, and Ural regions and conver them to catholicism";
        result.and(AchievementCondition::new(has_all_provinces, desc));
        result
    }

    fn better_than_napolean(&self) -> AchievementResult {
        let mut result = AchievementResult::new(134);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "FRA".parse().unwrap();
        let desc = "started as France";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "FRA".parse().unwrap();
        let desc = "currently France";
        result.and(AchievementCondition::new(playing, desc));

        result.and(self.owns_core_province_condition(ProvinceId::from(295)));
        result.and(self.owns_core_province_condition(ProvinceId::from(50)));
        result.and(self.owns_core_province_condition(ProvinceId::from(134)));

        result
    }

    fn good_king_rene(&self) -> AchievementResult {
        let mut result = AchievementResult::new(237);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "PRO".parse().unwrap();
        let desc = "started as Provence";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "KOJ".parse().unwrap();
        let desc = "currently Jerusalem";
        result.and(AchievementCondition::new(playing, desc));
        result
    }

    fn king_of_jerusalem(&self) -> AchievementResult {
        let mut result = AchievementResult::new(93);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = matches!(self.starting_country.as_str(), "KNI" | "CYP");
        let desc = "started as Cyprus or The Knights";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "KOJ".parse().unwrap();
        let desc = "currently Jerusalem";
        result.and(AchievementCondition::new(playing, desc));
        result
    }

    fn lazarus(&self) -> AchievementResult {
        let mut result = AchievementResult::new(157);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "SER".parse().unwrap();
        let desc = "started as Serbia";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "SER".parse().unwrap();
        let desc = "currently Serbia";
        result.and(AchievementCondition::new(playing, desc));

        let has_provinces = if result.completed() {
            self.all_provs_in_region("balkan_region", |province| {
                owned_and_cored_by(province, self.tag)
            })
        } else {
            false
        };

        let desc = "Own and core all provinces in the balkans";
        result.and(AchievementCondition::new(has_provinces, desc));
        result
    }

    pub fn luck_of_the_irish(&self) -> AchievementResult {
        let mut result = AchievementResult::new(55);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let desc = "started out as a nation with irish primary culture";
        let irish = self
            .query
            .country(&self.starting_country)
            .map_or(false, |country| {
                country
                    .history
                    .primary_culture
                    .as_ref()
                    .map_or(false, |c| c == "irish")
            });
        result.and(AchievementCondition::new(irish, desc));

        let has_provinces = if result.completed() {
            self.all_provs_in_region("british_isles_region", |province| {
                owned_and_cored_by(province, self.tag)
            })
        } else {
            false
        };

        let desc = "owns and cored british_isles";
        result.and(AchievementCondition::new(has_provinces, desc));
        result
    }

    pub fn mare_nostrum(&self) -> AchievementResult {
        let mut result = AchievementResult::new(171);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country != "PAP".parse().unwrap();
        let desc = "did not start as The Papal States";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "ROM".parse().unwrap();
        let desc = "currently The Roman Empire";
        result.and(AchievementCondition::new(playing, desc));

        let has_provinces = if result.completed() {
            if self.patch >= (1, 30) {
                &[
                    4752, 4753, 4699, 4701, 4700, 4779, 4706, 4175, 4174, 2297, 101, 102, 4729,
                    111, 112, 113, 114, 115, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127,
                    130, 136, 137, 4754, 142, 143, 144, 145, 146, 147, 148, 149, 151, 159, 163,
                    164, 197, 200, 201, 212, 213, 220, 221, 222, 222, 223, 226, 282, 284, 285, 286,
                    287, 316, 317, 318, 319, 320, 321, 325, 327, 328, 330, 333, 335, 337, 338, 339,
                    341, 341, 353, 354, 355, 356, 357, 358, 362, 363, 364, 378, 462, 1247, 1750,
                    1751, 1756, 1764, 4738, 1773, 1774, 1826, 1854, 1855, 1856, 1882, 1933, 1934,
                    1974, 2195, 2196, 2296, 2298, 2299, 2302, 2304, 2313, 2325, 2326, 2348, 2406,
                    2410, 2412, 2447, 2451, 2452, 2453, 2455, 2461, 2473, 2753, 2954, 2977, 2980,
                    2982, 2983, 2984, 2984, 2985, 2986, 2988, 2991, 2992, 3003, 4316, 4546, 4549,
                    4550, 4561, 4562, 4560, 4559, 4696, 4732, 4737, 4736, 4733, 4705, 4698, 4735,
                ][..]
            } else {
                &[
                    4175, 4174, 2297, 101, 102, 108, 111, 112, 113, 114, 115, 117, 118, 119, 120,
                    121, 122, 123, 124, 125, 126, 127, 130, 136, 137, 138, 142, 143, 144, 145, 146,
                    147, 148, 149, 151, 159, 163, 164, 197, 200, 201, 212, 213, 220, 221, 222, 222,
                    223, 226, 282, 284, 285, 286, 287, 316, 317, 318, 319, 320, 321, 325, 327, 328,
                    330, 333, 335, 337, 338, 339, 341, 341, 353, 354, 355, 356, 357, 358, 362, 363,
                    364, 378, 462, 1247, 1750, 1751, 1756, 1764, 1769, 1773, 1774, 1826, 1854,
                    1855, 1856, 1882, 1933, 1934, 1974, 2195, 2196, 2296, 2298, 2299, 2302, 2304,
                    2313, 2325, 2326, 2348, 2406, 2410, 2412, 2447, 2451, 2452, 2453, 2455, 2461,
                    2473, 2753, 2954, 2977, 2980, 2982, 2983, 2984, 2984, 2985, 2986, 2988, 2991,
                    2992, 3003, 4316, 4546, 4549, 4550, 4561, 4562, 4560, 4559,
                ][..]
            }
            .iter()
            .all(|prov_id| {
                self.save
                    .game
                    .provinces
                    .get(&ProvinceId::from(*prov_id))
                    .map(|prov| prov.owner)
                    .map_or(false, |owner| owner == Some(self.tag))
            })
        } else {
            false
        };

        let desc = "owns Mediterranean";
        result.and(AchievementCondition::new(has_provinces, desc));
        result
    }

    pub fn form_rome(&self) -> AchievementResult {
        let mut result = AchievementResult::new(10000);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let playing = self.tag == "ROM".parse().unwrap();
        let desc = "currently The Roman Empire";
        result.and(AchievementCondition::new(playing, desc));

        result
    }

    pub fn gold_rush(&self) -> AchievementResult {
        let mut result = AchievementResult::new(208);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let playing = self.tag == "GLH".parse().unwrap();
        let desc = "currently The Golden Horde";
        result.and(AchievementCondition::new(playing, desc));

        let before_date = self.query.save().meta.date < Eu4Date::from_ymd(1500, 1, 1);
        let desc = "before 1500";
        result.and(AchievementCondition::new(before_date, desc));

        let desc = "started out as a nation with a culture in the tatar group";
        let is_tartar = self
            .game
            .culture_group_cultures("tartar")
            .map_or(false, |mut cultures| {
                self.query
                    .country(&self.starting_country)
                    .map_or(false, |country| {
                        country
                            .history
                            .primary_culture
                            .as_ref()
                            .map_or(false, |c| cultures.any(|x| x == c))
                    })
            });

        result.and(AchievementCondition::new(is_tartar, desc));

        let desc = "started out as a steppe horde nation";
        let steppe_horde = self
            .query
            .country(&self.starting_country)
            .map_or(false, |country| {
                country
                    .history
                    .add_government_reform
                    .contains(&String::from("steppe_horde"))
            });
        result.and(AchievementCondition::new(steppe_horde, desc));
        result
    }

    pub fn tatarstan(&self) -> AchievementResult {
        let mut result = AchievementResult::new(159);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let kaz = "KAZ".parse().unwrap();
        let nog = "NOG".parse().unwrap();

        let started = self.starting_country == kaz || self.starting_country == nog;
        let desc = "started as Kazan or Nogai";
        result.and(AchievementCondition::new(started, desc));

        let playing = self.tag == kaz || self.tag == nog;
        let desc = "currently Kazan or Nogai";
        result.and(AchievementCondition::new(playing, desc));

        let desc = "owns all provinces in the tatar group";
        let owns = result.completed()
            && self
                .game
                .culture_group_cultures("tartar")
                .map_or(false, |mut cultures| {
                    self.save
                        .game
                        .provinces
                        .values()
                        .filter_map(|x| match x.culture.as_ref() {
                            Some(c) if cultures.any(|c1| c1 == c) => Some(x.owner),
                            _ => None,
                        })
                        .all(|x| x == Some(self.tag))
                });

        result.and(AchievementCondition::new(owns, desc));
        result
    }

    pub fn big_blue_blob(&self) -> AchievementResult {
        let mut result = AchievementResult::new(135);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "FRA".parse().unwrap();
        let desc = "started as France";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "FRA".parse().unwrap();
        let desc = "currently France";
        result.and(AchievementCondition::new(playing, desc));
        result.and(AchievementCondition::new(
            self.save.meta.date.year() < 1500,
            "the year is before 1500",
        ));

        let has_provinces = if result.completed() {
            match self.game.continent_provinces("europe") {
                Some(prov_ids) => {
                    prov_ids
                        .filter_map(|id| self.save.game.provinces.get(&id))
                        .filter(|prov| owned_and_cored_by(prov, self.tag))
                        .count()
                        >= 100
                }
                None => {
                    broken_invariant!("expected europe continent to exist");
                    false
                }
            }
        } else {
            false
        };

        result.and(AchievementCondition::new(
            has_provinces,
            "own and core 100 provinces in europe",
        ));
        result
    }

    pub fn dont_be_cilli(&self) -> AchievementResult {
        let mut result = AchievementResult::new(302);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "CLI".parse().unwrap();
        let desc = "started as Cilli";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag != "CLI".parse().unwrap();
        let desc = "currently is not Cilli";
        result.and(AchievementCondition::new(playing, desc));
        result
    }

    pub fn on_the_rhodes_again(&self) -> AchievementResult {
        let mut result = AchievementResult::new(307);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "KNI".parse().unwrap();
        let desc = "started as The Knights";
        result.and(AchievementCondition::new(starter, desc));

        result.and(self.owns_core_province_condition(ProvinceId::from(151)));
        result.and(self.owns_core_province_condition(ProvinceId::from(2313)));
        result.and(self.owns_core_province_condition(ProvinceId::from(379)));

        result
    }

    pub fn stiff_upper_lippe(&self) -> AchievementResult {
        let mut result = AchievementResult::new(306);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.tag == "LPP".parse().unwrap();
        let desc = "currently Lippe";
        result.and(AchievementCondition::new(starter, desc));

        let has_provs = if result.completed() {
            self.all_provs_in_region("british_isles_region", |province| {
                province.owner.map_or(false, |x| x == self.tag)
            })
        } else {
            false
        };

        result.and(AchievementCondition::new(has_provs, "owns british isles"));
        result
    }

    pub fn spaghetti_western(&self) -> AchievementResult {
        let mut result = AchievementResult::new(301);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "BLG".parse().unwrap();
        let desc = "started as Bologna";
        result.and(AchievementCondition::new(starter, desc));

        if self.patch < (1, 31) {
            let playing = matches!(self.tag.as_str(), "MEX" | "TEX");
            let desc = "currently Mexico or Texas";
            result.and(AchievementCondition::new(playing, desc));
        } else {
            let playing = matches!(self.tag.as_str(), "MEX" | "TEX" | "SNA");
            let desc = "currently Mexico, Texas, or Sonora";
            result.and(AchievementCondition::new(playing, desc));
        }

        result
    }

    pub fn aeiou(&self) -> AchievementResult {
        let mut result = AchievementResult::new(296);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let all_missions = [
            "emp_hab_union_with_poland",
            "emp_hab_no_one_to_threaten_us",
            "emp_hab_imperial_border",
            "emp_hab_empire_united_in_religion",
            "emp_hab_an_empire_roman",
            "emp_hab_empire_pass_reforms",
            "emp_hab_balanced_estates",
            "emp_hab_prospering_nation",
            "emp_hab_viennese_waltz",
            "emp_hab_the_hungarian_question",
            "emp_hab_all_minorities_are_welcome",
            "emp_hab_take_salzburg",
            "emp_hab_union_bayern",
            "emp_hab_swabia",
            "emp_hab_union_brandenburg",
            "emp_hab_connect_further_austria",
            "emp_hab_conquer_switzerland",
            "emp_hab_conquer_burgundy",
            "emp_hab_conquer_france",
            "emp_hab_take_serbia",
            "emp_hab_take_wallachia_bulgaria",
            "emp_hab_scourge_of_europe",
            "emp_hab_veneto_lombardy",
            "emp_hab_naples",
            "emp_hab_balance_of_power",
            "emp_hab_spread_dynasties",
            "emp_hab_our_balance_of_power",
            "emp_hab_crush_the_revolution",
            "emp_hab_power_to_habsburg",
            "emp_hab_austrian_netherlands",
            "emp_hab_ostend_company",
            "emp_hab_indian_trading",
            "emp_hab_foothold_in_china",
            "emp_hab_austrialasia",
            "emp_hab_develop_hungary_bohemia",
            "secure_the_imperial_crown",
            "subjugate_bohemia",
            "recover_silesia",
            "partition_poland",
            "subjugate_hungary",
            "austrian_hungary",
            "austrian_croatia",
            "conquer_transylvania",
            "austrian_italian_ambition",
            "emp_hab_imperial_capitals",
        ]
        .iter()
        .all(|x| self.country.completed_missions.iter().any(|y| y == x));

        let desc = "completed the Austrian mission tree";
        result.and(AchievementCondition::new(all_missions, desc));

        result
    }

    pub fn kingdom_of_god(&self) -> AchievementResult {
        let mut result = AchievementResult::new(305);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "PAP".parse().unwrap();
        let desc = "started as The Papal States";
        result.and(AchievementCondition::new(starter, desc));

        let god_flag = self
            .country
            .flags
            .iter()
            .any(|(flag, _)| flag == "is_kingdom_of_god_flag");
        let desc = "has the kingdom of god flag";
        result.and(AchievementCondition::new(god_flag, desc));
        result
    }

    pub fn global_hegemony(&self) -> AchievementResult {
        let mut result = AchievementResult::new(299);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let economic_hegemony = self
            .save
            .game
            .economic_hegemon
            .as_ref()
            .map_or(false, |x| x.country == self.tag && x.progress >= 100.0);
        let naval_hegemony = self
            .save
            .game
            .naval_hegemon
            .as_ref()
            .map_or(false, |x| x.country == self.tag && x.progress >= 100.0);
        let military_hegemony = self
            .save
            .game
            .military_hegemon
            .as_ref()
            .map_or(false, |x| x.country == self.tag && x.progress >= 100.0);

        let complete = economic_hegemony || naval_hegemony || military_hegemony;
        let desc = "has 100% progress in a hegemony";
        result.and(AchievementCondition::new(complete, desc));
        result
    }

    pub fn god_tier(&self) -> AchievementResult {
        let mut result = AchievementResult::new(300);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let religion = self
            .country
            .religion
            .as_ref()
            .map_or(false, |r| r != "catholic" && r != "sunni");
        result.and(AchievementCondition::new(
            religion,
            "is not catholic or sunni",
        ));

        let is_dof = self
            .country
            .religion
            .as_ref()
            .and_then(|r| self.save.game.religion_instance_data.get(r))
            .and_then(|r| r.defender)
            .map(|def| def == self.tag)
            .unwrap_or(false);
        result.and(AchievementCondition::new(
            is_dof,
            "is defender of the faith",
        ));

        let tier_5 = if is_dof {
            self.country
                .religion
                .as_ref()
                .map(|r| {
                    self.query
                        .countries()
                        .map(|x| x.country)
                        .filter(|country| country.num_of_cities >= 1)
                        .filter(|country| country.religion.as_ref().map_or(false, |r2| r == r2))
                        .count()
                })
                .unwrap_or(0)
                >= 50
        } else {
            false
        };

        result.and(AchievementCondition::new(tier_5, "tier 5"));
        result
    }

    pub fn everythings_coming_up_mulhouse(&self) -> AchievementResult {
        let mut result = AchievementResult::new(298);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "MLH".parse().unwrap();
        let desc = "started as Mulhouse";
        result.and(AchievementCondition::new(starter, desc));

        let is_emperor = &self
            .save
            .game
            .empire
            .as_ref()
            .and_then(|x| x.emperor)
            .map_or(false, |x| x == self.tag);

        result.and(AchievementCondition::new(*is_emperor, "is emperor"));

        let enacted_reichskrieg = self.save.game.empire.as_ref().map_or(false, |x| {
            x.passed_reforms.iter().any(|x| x == "emperor_reichskrieg")
        });

        result.and(AchievementCondition::new(
            enacted_reichskrieg,
            "enacted reichskrieg",
        ));
        result
    }

    fn true_heir_of_timur(&self) -> AchievementResult {
        let mut result = AchievementResult::new(277);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = matches!(
            self.starting_country.as_str(),
            "AFG" | "SIS" | "TRS" | "KHO" | "FRS"
        );

        let desc = "started as a subject of Timurids";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "MUG".parse().unwrap();
        let desc = "currently Mughals";
        result.and(AchievementCondition::new(playing, desc));

        result.and(AchievementCondition::new(
            self.save.meta.date.year() < 1550,
            "year is before 1550",
        ));

        let owns_india = if result.completed() {
            match self.game.superregion_regions("india_superregion") {
                Some(mut regions) => regions.all(|region| {
                    self.all_provs_in_region(region, |prov| {
                        prov.owner
                            .as_ref()
                            .map_or(false, |x| self.self_and_subjects.contains(x))
                    })
                }),
                None => {
                    broken_invariant!("india superregion not recognized");
                    false
                }
            }
        } else {
            false
        };

        result.and(AchievementCondition::new(owns_india, "conquered india"));
        result
    }

    pub fn a_manchurian_candidate(&self) -> AchievementResult {
        let mut result = AchievementResult::new(84);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        let is_qng = self.tag == "QNG".parse().unwrap();
        result.and(AchievementCondition::new(is_qng, "is QNG tag"));

        let desc = "started out as a nation with Jurchen primary culture";
        let jurchen = self
            .query
            .country(&self.starting_country)
            .map_or(false, |country| {
                country
                    .history
                    .primary_culture
                    .as_ref()
                    .map_or(false, |c| c == "jurchen")
            });
        result.and(AchievementCondition::new(jurchen, desc));
        result
    }

    pub fn ruina_imperii(&self) -> AchievementResult {
        let mut result = AchievementResult::new(47);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        // From eu4 wiki: Since a nation is a member of the HRE if and only if its capital province
        // is in the HRE
        let hre_countries = self
            .query
            .countries()
            .map(|x| x.country)
            .filter(|country| country.num_of_cities >= 1)
            .filter_map(|country| self.save.game.provinces.get(&country.capital))
            .filter(|prov| prov.hre)
            .count();

        let hre_gone = hre_countries == 0;
        result.and(AchievementCondition::new(
            hre_gone,
            "no countries in the HRE",
        ));

        let hrl_tag = self
            .query
            .country(&"HRL".parse().unwrap())
            .map_or(true, |x| x.num_of_cities == 0);

        result.and(AchievementCondition::new(
            hrl_tag,
            "is HRL tag doesn't exist",
        ));
        result
    }

    pub fn avar_khaganate(&self) -> AchievementResult {
        let mut result = AchievementResult::new(239);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "AVR".parse().unwrap();
        let desc = "started as Avaria";
        result.and(AchievementCondition::new(starter, desc));

        let is_empire = self.country.government_rank >= 3;
        result.and(AchievementCondition::new(
            is_empire,
            "has an empire government",
        ));

        let has_all_provinces = if result.completed() {
            [
                "alfold_area",
                "transdanubia_area",
                "slovakia_area",
                "transylvania_area",
                "southern_transylvania_area",
            ]
            .iter()
            .all(|area| {
                self.all_provs_in_area(area, |prov| {
                    prov.owner.map_or(false, |x| x == self.starting_country)
                })
            })
        } else {
            false
        };

        result.and(AchievementCondition::new(
            has_all_provinces,
            "owns Hungary as Avaria",
        ));
        result
    }

    pub fn albania_or_iberia(&self) -> AchievementResult {
        let mut result = AchievementResult::new(105);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "ALB".parse().unwrap();
        let desc = "started as Albania";
        result.and(AchievementCondition::new(starter, desc));

        let has_all_provinces = if result.completed() {
            ["iberia_region", "caucasia_region"].iter().all(|region| {
                self.all_provs_in_region(region, |prov| {
                    prov.owner
                        .as_ref()
                        .map_or(false, |x| self.self_and_subjects.contains(x))
                })
            })
        } else {
            false
        };

        result.and(AchievementCondition::new(
            has_all_provinces,
            "owns Iberia and the Caucasus",
        ));
        result
    }

    pub fn a_heros_welcome(&self) -> AchievementResult {
        let mut result = AchievementResult::new(242);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "KAR".parse().unwrap();
        let desc = "started as Karaman";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "RUM".parse().unwrap();
        let desc = "currently Rûm";
        result.and(AchievementCondition::new(playing, desc));

        result
    }

    pub fn rise_of_the_white_sheep(&self) -> AchievementResult {
        let mut result = AchievementResult::new(210);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "AKK".parse().unwrap();
        let desc = "started as Aq Qoyunlu";
        result.and(AchievementCondition::new(starter, desc));
        let qar = "QAR".parse().unwrap();

        let owns_tabriz = self
            .save
            .game
            .provinces
            .get(&ProvinceId::from(416))
            .map_or(false, |prov| {
                prov.owner.map_or(false, |x| x == self.starting_country)
            });
        let desc = "owns Tabriz (416)";
        result.and(AchievementCondition::new(owns_tabriz, desc));

        let qara_gone = if result.completed() {
            !self
                .save
                .game
                .provinces
                .iter()
                .any(|(_, prov)| prov.owner.map_or(false, |owner| owner == qar))
        } else {
            false
        };
        let desc = "Qara Qoyunlu does not exist";
        result.and(AchievementCondition::new(qara_gone, desc));

        result
    }

    pub fn eat_your_greens(&self) -> AchievementResult {
        let mut result = AchievementResult::new(275);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "KAL".parse().unwrap();
        let desc = "started as Kale";
        result.and(AchievementCondition::new(starter, desc));

        let age = matches!(
            self.save.game.current_age.as_str(),
            "age_of_absolutism" | "age_of_revolutions"
        );
        let desc = "is not the age of absolutism or revolutions";
        result.and(AchievementCondition::new(!age, desc));

        let owned = if result.completed() {
            self.game
                .continent_provinces("asia")
                .map_or(false, |provs| {
                    provs
                        .filter(|x| {
                            self.game
                                .get_province(x)
                                .map_or(true, |x| x.terrain == schemas::eu4::Terrain::Grasslands)
                        })
                        .all(|prov| {
                            self.save
                                .game
                                .provinces
                                .get(&prov)
                                .and_then(|x| x.owner)
                                .map_or(false, |x| self.self_and_subjects.contains(&x))
                        })
                })
        } else {
            false
        };

        result.and(AchievementCondition::new(owned, "every province in Asia with Grasslands terrain is owned by the country or a subject other than a tributary"));

        result
    }

    pub fn empire_of_mann(&self) -> AchievementResult {
        let mut result = AchievementResult::new(259);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let playing = self.tag == "KOI".parse().unwrap();
        let desc = "currently Mann";
        result.and(AchievementCondition::new(playing, desc));

        let owned = if result.completed() {
            self.game
                .provinces()
                .filter(|x| x.province_is_on_an_island)
                .all(|prov| {
                    self.save
                        .game
                        .provinces
                        .get(&prov.id)
                        .and_then(|x| x.owner)
                        .map_or(false, |x| self.self_and_subjects.contains(&x))
                })
        } else {
            false
        };

        result.and(AchievementCondition::new(
            owned,
            "own or have non-tributary subjects own all provinces which are on an island.",
        ));

        result
    }

    pub fn shahanshah(&self) -> AchievementResult {
        let mut result = AchievementResult::new(89);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "ARL".parse().unwrap();
        let desc = "started as Ardabil";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "PER".parse().unwrap();
        let desc = "currently Persia";
        result.and(AchievementCondition::new(playing, desc));

        result
    }

    pub fn this_is_persia(&self) -> AchievementResult {
        let mut result = AchievementResult::new(118);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let playing = self.tag == "PER".parse().unwrap();
        let desc = "currently Persia";
        result.and(AchievementCondition::new(playing, desc));

        let has_all_provinces = if result.completed() {
            ["anatolia_region", "egypt_region"].iter().all(|region| {
                self.all_provs_in_region(region, |province| {
                    province.owner.map_or(false, |x| x == self.tag)
                        && province.cores.contains(&self.tag)
                })
            })
        } else {
            false
        };

        let has_all_provs_in_area = if result.completed() {
            ["morea_area", "northern_greece_area", "macedonia_area"]
                .iter()
                .all(|region| {
                    self.all_provs_in_area(region, |province| {
                        province.owner.map_or(false, |x| x == self.tag)
                            && province.cores.contains(&self.tag)
                    })
                })
        } else {
            false
        };

        let desc = "owns and cored the persian conquests";
        result.and(AchievementCondition::new(
            has_all_provinces && has_all_provs_in_area,
            desc,
        ));

        result
    }

    pub fn african_power(&self) -> AchievementResult {
        let mut result = AchievementResult::new(42);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let kon = "KON".parse().unwrap();
        let starter = self.starting_country == kon;
        let desc = "started as Kongo";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == kon;
        let desc = "currently Kongo";
        result.and(AchievementCondition::new(playing, desc));

        let kongo_owns_africa = if result.completed() {
            self.all_provs_in_continent("africa", |prov| {
                self.owns_core_province(prov)
                    || self.is_wasteland_or_empty_province(prov)
                    || self.is_colony(prov)
            })
        } else {
            false
        };

        let desc = "owned and cored all of africa";
        result.and(AchievementCondition::new(kongo_owns_africa, desc));
        result
    }

    pub fn stern_des_sudens(&self) -> AchievementResult {
        let mut result = AchievementResult::new(304);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "UBV".parse().unwrap();
        let desc = "started as Munich";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "BAV".parse().unwrap();
        let desc = "currently Bavaria";
        result.and(AchievementCondition::new(playing, desc));

        let bre = "BRE".parse().unwrap();
        let bremen_subject = self.self_and_subjects.contains(&bre);
        let desc = "Bremen is a subject";
        result.and(AchievementCondition::new(bremen_subject, desc));

        let bremen_owns = self
            .save
            .game
            .provinces
            .get(&ProvinceId::from(2778))
            .and_then(|x| x.owner.as_ref())
            .map_or(false, |&x| x == bre);
        let desc = "Bremen owns Werder";
        result.and(AchievementCondition::new(bremen_owns, desc));

        result
    }

    pub fn terra_mariana(&self) -> AchievementResult {
        let mut result = AchievementResult::new(160);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let riga = "RIG".parse().unwrap();
        let starter = self.starting_country == riga;
        let desc = "started as Riga";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == riga;
        let desc = "currently Riga";
        result.and(AchievementCondition::new(playing, desc));

        let owns_baltic = if result.completed() {
            self.all_provs_in_region("baltic_region", |p| owned_and_cored_by(p, riga))
        } else {
            false
        };

        let desc = "Riga owns and cored baltic region";
        result.and(AchievementCondition::new(owns_baltic, desc));

        result
    }

    pub fn draculas_revenge(&self) -> AchievementResult {
        let mut result = AchievementResult::new(110);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let playing = self.tag == "RMN".parse().unwrap();
        let desc = "currently Romania";
        result.and(AchievementCondition::new(playing, desc));

        let desc = "started out as a nation with Romanian primary culture";
        let romanian = self
            .query
            .country(&self.starting_country)
            .map_or(false, |country| {
                country
                    .history
                    .primary_culture
                    .as_ref()
                    .map_or(false, |c| c == "romanian")
            });
        result.and(AchievementCondition::new(romanian, desc));

        let owns_balkan = if result.completed() {
            self.all_provs_in_region("balkan_region", |p| {
                self.owns_or_non_sovereign_subject_of_province(p)
            })
        } else {
            false
        };

        result.and(AchievementCondition::new(owns_balkan, "owns balkans"));
        result
    }

    pub fn ultimate_military(&self) -> AchievementResult {
        let mut result = AchievementResult::new(321);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let song = "SON".parse().unwrap();
        let desc = "started as Songhai";
        result.and(AchievementCondition::new(
            self.starting_country == song,
            desc,
        ));

        let desc = "currently Songhai";
        result.and(AchievementCondition::new(self.tag == song, desc));

        let prussia = "PRU".parse().unwrap();
        let nepal = "NPL".parse().unwrap();
        let prussian_march = self
            .save
            .game
            .diplomacy
            .dependencies
            .iter()
            .any(|x| x.first == song && x.second == prussia && x.subject_type == "march");

        let nepal_march = self
            .save
            .game
            .diplomacy
            .dependencies
            .iter()
            .any(|x| x.first == song && x.second == nepal && x.subject_type == "march");

        let desc = "Prussia march";
        result.and(AchievementCondition::new(prussian_march, desc));

        let desc = "Nepal march";
        result.and(AchievementCondition::new(nepal_march, desc));
        result
    }

    pub fn where_are_the_penguins(&self) -> AchievementResult {
        let mut result = AchievementResult::new(324);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        fn is_malagasy(tag: CountryTag) -> bool {
            matches!(tag.as_str(), "SKA" | "BTS" | "MIR" | "MFY" | "ANT")
        }

        let starter = is_malagasy(self.starting_country);
        let desc = "started as Malagasy country";
        result.and(AchievementCondition::new(starter, desc));

        let starter = is_malagasy(self.tag);
        let desc = "currently a Malagasy country";
        result.and(AchievementCondition::new(starter, desc));

        let provinces = if result.completed() {
            [
                1177, 1179, 833, 1180, 1084, 2727, 2736, 1086, 2735, 1087, 2734, 4869, 4868, 1085,
                4858, 1246, 1109, 783, 782, 2869, 1095, 2025,
            ]
            .iter()
            .all(|id| self.owns_or_non_sovereign_subject_of_id(ProvinceId::new(*id)))
                && [
                    "madagascar_highlands_area",
                    "betsimasaraka_area",
                    "sakalava_area",
                    "southern_madagascar",
                ]
                .iter()
                .all(|x| {
                    self.all_provs_in_area(x, |province| {
                        self.owns_or_non_sovereign_subject_of_province(province)
                    })
                })
        } else {
            false
        };

        let desc = "owns penguin lands";
        result.and(AchievementCondition::new(provinces, desc));
        result
    }

    pub fn khaaaaaan(&self) -> AchievementResult {
        let mut result = AchievementResult::new(326);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let current = self.tag == "MGE".parse().unwrap();
        let desc = "currently the mongol empire";
        result.and(AchievementCondition::new(current, desc));

        let age = matches!(
            self.save.game.current_age.as_str(),
            "age_of_absolutism" | "age_of_revolutions"
        );
        let desc = "is not the age of absolutism or revolutions";
        result.and(AchievementCondition::new(!age, desc));

        result
    }

    pub fn knights_of_the_caribbean(&self) -> AchievementResult {
        let mut result = AchievementResult::new(327);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "KNI".parse().unwrap();
        let desc = "started as The Knights";
        result.and(AchievementCondition::new(starter, desc));

        let provinces = if result.completed() {
            [
                320, 321, 163, 164, 2348, 3003, 4700, 4698, 142, 2982, 124, 125, 4737, 4736, 2954,
                126, 127, 1247, 4559, 4560, 333, 112, 4735, 2986,
            ]
            .iter()
            .all(|id| self.owns_core_province_id(ProvinceId::from(*id)))
                && self
                    .all_provs_in_region("carribeans_region", |p| owned_and_cored_by(p, self.tag))
        } else {
            false
        };

        let desc = "owns the Carribean and Mediteranean islands";
        result.and(AchievementCondition::new(provinces, desc));
        result
    }

    pub fn australia_hungary(&self) -> AchievementResult {
        let mut result = AchievementResult::new(328);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        fn is_australian_tag(tag: CountryTag) -> bool {
            matches!(
                tag.as_str(),
                "AUS"
                    | "TIW"
                    | "LAR"
                    | "YOL"
                    | "YNU"
                    | "AWN"
                    | "GMI"
                    | "MIA"
                    | "EOR"
                    | "KUL"
                    | "KAU"
                    | "PLW"
                    | "WRU"
                    | "NOO"
                    | "MLG"
            )
        }

        let desc = "started as an Australian tribe";
        let starter = is_australian_tag(self.starting_country);
        result.and(AchievementCondition::new(starter, desc));

        let playing = is_australian_tag(self.tag);
        let desc = "currently an Australian tribe";
        result.and(AchievementCondition::new(playing, desc));

        let provinces = if result.completed() {
            self.all_provs_in_region("australia_region", |p| {
                p.religion.as_ref() == self.country.religion.as_ref()
            })
        } else {
            false
        };

        let desc = "owns the Australia region";
        result.and(AchievementCondition::new(provinces, desc));

        let desc = "subjugated Hungary";
        let hungary = "HUN".parse::<CountryTag>().unwrap();
        let vassal = self
            .save
            .game
            .diplomacy
            .dependencies
            .iter()
            .any(|x| x.first == self.tag && x.second == hungary && x.subject_type == "vassal");
        result.and(AchievementCondition::new(vassal, desc));

        result
    }

    pub fn shemot_is_not(&self) -> AchievementResult {
        let mut result = AchievementResult::new(329);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let jewish = self
            .country
            .religion
            .as_ref()
            .map_or(false, |x| x == "jewish");
        let desc = "Is Jewish";
        result.and(AchievementCondition::new(jewish, desc));

        let aspect_active = self.country.church.as_ref().map_or(false, |x| {
            x.aspects.iter().any(|x| x == "judaism_communities_aspect")
        });
        let desc = "Jewish Community Aspect active";
        result.and(AchievementCondition::new(aspect_active, desc));

        let province_religions = if result.completed() {
            self.all_provs_in_region("egypt_region", |p| {
                p.religion.as_ref().map_or(false, |x| x == "jewish")
            })
        } else {
            false
        };

        let desc = "Convert all of Egypt to Jewish";
        result.and(AchievementCondition::new(province_religions, desc));

        result
    }

    pub fn one_nation_to_rule_them_all(&self) -> AchievementResult {
        let mut result = AchievementResult::new(330);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let current = self.tag == "SRU".parse().unwrap();
        let desc = "currently the Saruhan";
        result.and(AchievementCondition::new(current, desc));

        let large_vassals = self
            .save
            .game
            .diplomacy
            .dependencies
            .iter()
            .filter(|x| x.first == self.tag && x.subject_type == "vassal")
            .map(|x| x.second)
            .filter_map(|x| self.query.country(&x))
            .filter(|x| x.development >= 100.0)
            .count();

        let desc = "9 vassals with at least 100 development";
        result.and(AchievementCondition::new(large_vassals >= 9, desc));

        result
    }

    pub fn swahili_persuasion(&self) -> AchievementResult {
        let mut result = AchievementResult::new(331);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let kilwa = "ZAN".parse().unwrap();
        let starter = self.starting_country == kilwa;
        let desc = "started as Kilwa";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == kilwa;
        let desc = "currently Kilwa";
        result.and(AchievementCondition::new(playing, desc));

        let province_religions = if result.completed() {
            ["moluccas_region", "indonesia_region"]
                .iter()
                .all(|region| {
                    self.all_provs_in_region(region, |p| {
                        p.religion.as_ref() == self.country.religion.as_ref()
                    })
                })
        } else {
            false
        };

        let desc = "The Moluccas and Indonesia are Kilwa's religion";
        result.and(AchievementCondition::new(province_religions, desc));

        result
    }

    pub fn i_dont_like_sand(&self) -> AchievementResult {
        let mut result = AchievementResult::new(332);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let most_dev = self
            .query
            .countries()
            .map(|x| x.country)
            .all(|x| x.development < self.country.development);

        let desc = "Have the most development";
        result.and(AchievementCondition::new(most_dev, desc));

        let owned = if result.completed() {
            self.save
                .game
                .provinces
                .iter()
                .filter(|(_, prov)| prov.owner.as_ref().map_or(false, |x| x == &self.tag))
                .all(|(id, _)| {
                    self.game.get_province(id).map_or(false, |x| {
                        matches!(
                            x.terrain,
                            schemas::eu4::Terrain::Desert | schemas::eu4::Terrain::CoastalDesert
                        )
                    })
                })
        } else {
            false
        };

        let desc = "Own only desert and coastal desert";
        result.and(AchievementCondition::new(owned, desc));

        result
    }

    pub fn atwix_legacy(&self) -> AchievementResult {
        let mut result = AchievementResult::new(335);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let desc = "have 10 personal unions";
        let unions = self
            .save
            .game
            .diplomacy
            .dependencies
            .iter()
            .filter(|x| x.first == self.tag && x.subject_type == "personal_union")
            .count();
        result.and(AchievementCondition::new(unions >= 10, desc));

        result
    }

    pub fn not_just_pizza(&self) -> AchievementResult {
        let mut result = AchievementResult::new(198);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let naples = "NAP".parse().unwrap();
        let starter = self.starting_country == naples;
        let desc = "started as Naples";
        result.and(AchievementCondition::new(starter, desc));

        let great_power = self
            .country
            .flags
            .iter()
            .any(|(flag, _)| flag == "became_great_power_flag");
        let desc = "became a great power";
        result.and(AchievementCondition::new(great_power, desc));

        result
    }

    pub fn re_reqonquista(&self) -> AchievementResult {
        let mut result = AchievementResult::new(64);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let granada = "GRA".parse().unwrap();
        let starter = self.starting_country == granada;
        let desc = "started as Granada";
        result.and(AchievementCondition::new(starter, desc));

        let adu = "ADU".parse().unwrap();
        let playing = self.tag == adu;
        let desc = "currently Andalusia";
        result.and(AchievementCondition::new(playing, desc));

        let owns_baltic = if result.completed() {
            self.all_provs_in_region("iberia_region", |p| owned_and_cored_by(p, adu))
        } else {
            false
        };

        let desc = "Andalusia own and core all provinces of Iberia";
        result.and(AchievementCondition::new(owns_baltic, desc));

        result
    }

    pub fn brick_by_brick(&self) -> AchievementResult {
        let mut result = AchievementResult::new(336);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let denmark = "DAN".parse().unwrap();
        let starter = self.starting_country == denmark;
        let desc = "started as Denmark";
        result.and(AchievementCondition::new(starter, desc));

        let reform = self.country.government.as_ref().map_or(false, |x| {
            x.reform_stack
                .reforms
                .iter()
                .any(|r| r == "danish_archkingdom")
        });
        let desc = "enact the Unified Kalmar Monarchy government reform";
        result.and(AchievementCondition::new(reform, desc));

        let territory = if result.completed() {
            self.all_provs_in_region("scandinavia_region", |p| owned_and_cored_by(p, denmark))
        } else {
            false
        };

        let desc = "Own and core all of Scandinavia";
        result.and(AchievementCondition::new(territory, desc));

        result
    }

    pub fn holy_hoarder(&self) -> AchievementResult {
        let mut result = AchievementResult::new(340);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "TEU".parse().unwrap();
        let desc = "started as Teutonic Order";
        result.and(AchievementCondition::new(starter, desc));

        let current = self.tag == "MGE".parse().unwrap();
        let desc = "currently Mongol Empire";
        result.and(AchievementCondition::new(current, desc));

        let reform = self.country.government.as_ref().map_or(false, |x| {
            x.reform_stack
                .reforms
                .iter()
                .any(|r| r == "holy_horde_reform")
        });
        let desc = "Holy Horde government reform enacted";
        result.and(AchievementCondition::new(reform, desc));

        result
    }

    pub fn purify_the_temple(&self) -> AchievementResult {
        let mut result = AchievementResult::new(344);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "RIG".parse().unwrap();
        let desc = "started as Riga";
        result.and(AchievementCondition::new(starter, desc));

        let reform = self.country.government.as_ref().map_or(false, |x| {
            x.reform_stack
                .reforms
                .iter()
                .any(|r| r == "reformer_state_reform")
        });
        let desc = "enact the Salvific Plutocracy government reform";
        result.and(AchievementCondition::new(reform, desc));

        let flag = self
            .country
            .flags
            .iter()
            .any(|(flag, _)| flag == "looted_heretic_church_of_rome");
        let desc = "raid the heretic church of Rome";
        result.and(AchievementCondition::new(flag, desc));

        result
    }

    pub fn almost_prussian_blue(&self) -> AchievementResult {
        let mut result = AchievementResult::new(345);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "LIV".parse().unwrap();
        let desc = "started as Livonian Order";
        result.and(AchievementCondition::new(starter, desc));

        let current = self.tag == "LVA".parse().unwrap();
        let desc = "currently Livonia";
        result.and(AchievementCondition::new(current, desc));

        let territory = if result.completed() {
            self.all_provs_in_area("east_prussia_area", |p| owned_and_cored_by(p, self.tag))
                && self.all_provs_in_area("west_prussia_area", |p| owned_and_cored_by(p, self.tag))
                && self.all_provs_in_area("silesia_area", |p| owned_and_cored_by(p, self.tag))
                && self.all_provs_in_area("bohemia_area", |p| owned_and_cored_by(p, self.tag))
                && self.all_provs_in_area("moravia_area", |p| owned_and_cored_by(p, self.tag))
                && self.all_provs_in_area("erzgebirge_area", |p| owned_and_cored_by(p, self.tag))
                && self.owns_core_province_id(ProvinceId::from(1859))
                && self.owns_core_province_id(ProvinceId::from(4523))
                && self.owns_core_province_id(ProvinceId::from(4526))
                && self.owns_core_province_id(ProvinceId::from(254))
                && self.owns_core_province_id(ProvinceId::from(2963))
                && self.owns_core_province_id(ProvinceId::from(1931))
        } else {
            false
        };
        let desc = "own the territory of the North German Confederation as core provinces";
        result.and(AchievementCondition::new(territory, desc));

        result
    }

    pub fn hannukah_mutapa(&self) -> AchievementResult {
        let mut result = AchievementResult::new(346);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());

        let starter = self.starting_country == "ZIM".parse().unwrap();
        let desc = "started as Mutapa";
        result.and(AchievementCondition::new(starter, desc));

        let religion = self
            .country
            .religion
            .as_ref()
            .map_or(false, |x| x == "jewish");
        let desc = "is Jewish";
        result.and(AchievementCondition::new(religion, desc));

        let flag = self
            .country
            .flags
            .iter()
            .any(|(flag, _)| flag == "has_celebrated_festival");
        let desc = "has celebrated a festival";
        result.and(AchievementCondition::new(flag, desc));

        result
    }

    /*    pub fn gothic_invasion(&self) -> AchievementResult {
        let mut result = AchievementResult::new(101);
        result.and(self.no_custom_nations());
        result.and(self.normal_start_date());
        result.and(self.has_not_switched_nation());

        let starter = self.starting_country == "FEO".parse().unwrap();
        let desc = "started as Theodoro";
        result.and(AchievementCondition::new(starter, desc));

        let playing = self.tag == "FEO".parse().unwrap();
        let desc = "currently Theodoro";
        result.and(AchievementCondition::new(playing, desc));

        let culture = self.country.primary_culture.map_or(false, |x| x.as_str() == "goths");
        let desc = "primary culture is goths";
        result.and(AchievementCondition::new(culture, desc));

        let desc = "all germanic european provinces are owned by Theodoro";
        let feo_owns_germanic_europe = if result.completed() {
        self.game.continents.get("europe").map_or(false, |provs| {
            provs.iter()
                .all(|prov_id|
                    self.save.game.provinces.get(prov_id)
                        .map_or(false, |prov|
                            prov.culture_group.as_str() != "germanic" ||
                              prov.owner.map_or(false, |owner| owner.as_str() == "FEO")))
        })
        } else {
            false
        };

        result.and(AchievementCondition::new(feo_owns_germanic_europe, desc));
        result
    }*/
}
