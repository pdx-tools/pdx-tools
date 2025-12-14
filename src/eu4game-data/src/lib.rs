use serde::{Deserialize, Serialize};

#[allow(
    clippy::match_single_binding,
    reason = "When there is only a single patch of game data, the match statement will be redundant."
)]
mod embedded_game {
    include!(concat!(env!("OUT_DIR"), "/embedded_game.rs"));
}

pub use embedded_game::*;

#[derive(Debug, Serialize, Deserialize, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub enum Difficulty {
    VeryEasy = 0,
    Easy = 1,
    Medium = 2,
    Hard = 3,
    VeryHard = 4,
    Insane = 5,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
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
            id: 99,
            name: String::from("Prester John"),
            description: String::from("Own and have cores on Alexandria, Antioch and Constantinople as Coptic Ethiopia."),
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
            id: 154,
            name: String::from("The Third Way"),
            description: String::from("Start as an Ibadi nation and eliminate all rival schools of Islam (do not convert to another religion)."),
            difficulty: Difficulty::VeryHard,
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
            id: 200,
            name: String::from("A Blessed Nation"),
            description: String::from("As a Coptic Nation, gain all 5 Blessings."),
            difficulty: Difficulty::Hard,
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
        },  Achievement {
            id: 285,
            name: String::from("Tiger of Mysore"),
            description: String::from("Starting as Mysore, Conquer the Deccan and Coromandel Regions."),
            difficulty: Difficulty::Hard,
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
        }, Achievement {
            id: 348,
            name: String::from("Mehmet's Ambition"),
            description: String::from("Starting as The Ottomans, own or have Core Eyalets own all the provinces required to form the Roman Empire before 1500."),
            difficulty: Difficulty::VeryHard,
        }, Achievement {
            id: 10000,
            name: String::from("Form the Roman Empire"),
            description: String::from("Custom achievement where one needs to form the Roman Empire"),
            difficulty: Difficulty::Medium,
        },
    ]
}
