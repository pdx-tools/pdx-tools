use bumpalo_serde::ArenaDeserialize;
use jomini::common::{DateError, DateFormat, PdsDate, PdsDateFormatter, RawDate};
use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{self, Visitor},
};
use std::fmt::{self, Debug};

/// A date in EU5 format
///
/// All years are common years (i.e. no leap years).
///
/// In-game hours are between 08:00 and 19:00, inclusive. Hours are serialized
/// in save files with the hour divided by 2 and added to 8. This means only
/// even hour components (0, 2, 4, 6, ..., 22) are valid in the game format.
///
/// Some examples of how in-game hours are serialized in the game format.
///
/// - 08:00 → no hour component
/// - 09:00 → hour component 2  
/// - 10:00 → hour component 4
/// - 11:00 → hour component 6
/// - 19:00 → hour component 22
///
/// ```
/// # use eu5save::Eu5Date;
/// # use jomini::common::PdsDate;
///
/// let test_cases = [
///     ("1444.11.11", "1444-11-11T08"),      // 08:00 in-game
///     ("1444.11.11.2", "1444-11-11T09"),    // 09:00 in-game  
///     ("1444.11.11.4", "1444-11-11T10"),    // 10:00 in-game
///     ("1444.11.11.22", "1444-11-11T19"),   // 19:00 in-game
/// ];
///
/// for (input, expected_iso) in test_cases {
///     let date = Eu5Date::parse(input).unwrap();
///     assert_eq!(date.iso_8601().to_string(), expected_iso);
/// }
/// ```
///
/// The game format is for roundtrip compatibility with the game.
///
/// ```
/// # use eu5save::Eu5Date;
/// # use jomini::common::PdsDate;
///
/// let test_cases = [
///     ("1444.11.11", 8),       // 08:00 in-game
///     ("1444.11.11.2", 9),     // 09:00 in-game
///     ("1444.11.11.4", 10),    // 10:00 in-game
///     ("1444.11.11.22", 19),   // 19:00 in-game
/// ];
///
/// for (input, expected_hour) in test_cases {
///     let date = Eu5Date::parse(input).unwrap();
///     assert_eq!(date.hour(), expected_hour);
///     // Game format preserves original input
///     assert_eq!(date.game_fmt().to_string(), input);
///     // Roundtrip equivalence
///     let roundtrip = Eu5Date::parse(date.game_fmt().to_string()).unwrap();
///     assert_eq!(date, roundtrip);
/// }
/// ```
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Eu5Date {
    raw: RawDate,
}

impl Debug for Eu5Date {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Eu5Date({})", self.game_fmt())
    }
}

impl Eu5Date {
    fn from_raw(raw: RawDate) -> Option<Self> {
        const DAYS_PER_MONTH: [u8; 13] = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let days = DAYS_PER_MONTH[usize::from(raw.month())];
        if raw.day() > days {
            return None;
        }

        if raw.hour() > 22 {
            return None;
        }

        Some(Self { raw })
    }

    #[inline]
    pub fn parse<T: AsRef<[u8]>>(s: T) -> Result<Self, DateError> {
        let date = RawDate::parse(s)?;
        Self::from_raw(date).ok_or(DateError)
    }

    #[inline]
    pub fn from_binary(s: i32) -> Option<Self> {
        RawDate::from_binary(s).and_then(Self::from_raw)
    }

    #[inline]
    pub fn from_binary_heuristic(s: i32) -> Option<Self> {
        let date = RawDate::from_binary(s)?;
        if date.hour() % 2 == 1 {
            return None;
        }

        if date.year() <= -100 {
            return None;
        }

        Self::from_raw(date)
    }

    #[inline]
    pub fn hour(&self) -> u8 {
        // Convert game format hour component to in-game hour
        // Game format: 0 = 08:00, 2 = 09:00, 4 = 10:00, ..., 22 = 19:00
        self.raw.hour() / 2 + 8
    }

    /// Format only the date components (year, month, day) without hour
    pub fn date_fmt(&self) -> PdsDateFormatter {
        let date_only_raw =
            RawDate::from_ymdh(self.raw.year(), self.raw.month(), self.raw.day(), 0);
        PdsDateFormatter::new(date_only_raw, DateFormat::Iso8601)
    }
}

impl PdsDate for Eu5Date {
    #[inline]
    fn year(&self) -> i16 {
        self.raw.year()
    }

    #[inline]
    fn month(&self) -> u8 {
        self.raw.month()
    }

    #[inline]
    fn day(&self) -> u8 {
        self.raw.day()
    }

    fn iso_8601(&self) -> PdsDateFormatter {
        // Use the same conversion as the hour() method, but add 1 for ISO formatter
        // (ISO formatter shows hour-1, so we need hour+1 to get the right output)
        let in_game_hour = self.hour() + 1;
        let iso_raw = RawDate::from_ymdh(
            self.raw.year(),
            self.raw.month(),
            self.raw.day(),
            in_game_hour,
        );

        PdsDateFormatter::new(iso_raw, DateFormat::Iso8601)
    }

    fn game_fmt(&self) -> PdsDateFormatter {
        // We store the game format internally, so just use it directly
        PdsDateFormatter::new(self.raw, DateFormat::DotShort)
    }
}

impl Serialize for Eu5Date {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.iso_8601().to_string().as_str())
    }
}

struct DateVisitor;

impl Visitor<'_> for DateVisitor {
    type Value = Eu5Date;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a date")
    }

    fn visit_i32<E>(self, v: i32) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Eu5Date::from_binary(v)
            .ok_or_else(|| de::Error::custom(format!("invalid binary date: {v}")))
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Eu5Date::parse(v.as_bytes()).map_err(|_| de::Error::custom(format!("invalid date: {v}")))
    }

    fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(v.as_str())
    }
}

impl<'de> Deserialize<'de> for Eu5Date {
    fn deserialize<D>(deserializer: D) -> Result<Eu5Date, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_any(DateVisitor)
    }
}

impl<'bump> ArenaDeserialize<'bump> for Eu5Date {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // Eu5Date doesn't need arena allocation, so we can just use the standard deserializer
        Self::deserialize(deserializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_date_fmt() {
        let test_cases = [
            ("1444.11.11", "1444-11-11"),    // No hour component
            ("1444.11.11.2", "1444-11-11"),  // 09:00 in-game -> date only
            ("1444.11.11.4", "1444-11-11"),  // 10:00 in-game -> date only
            ("1444.11.11.22", "1444-11-11"), // 19:00 in-game -> date only
            ("1500.1.1", "1500-01-01"),      // Single digit month/day
            ("1500.12.31", "1500-12-31"),    // End of year
        ];

        for (input, expected_date_fmt) in test_cases {
            let date = Eu5Date::parse(input).unwrap();
            assert_eq!(
                date.date_fmt().to_string(),
                expected_date_fmt,
                "date_fmt() for input '{}' should return '{}'",
                input,
                expected_date_fmt
            );
        }
    }

    #[test]
    fn test_date_fmt_vs_game_fmt() {
        let test_cases = [
            ("1444.11.11", "1444.11.11"),
            ("1444.11.11.2", "1444.11.11.2"),
            ("1444.11.11.4", "1444.11.11.4"),
            ("1444.11.11.22", "1444.11.11.22"),
        ];

        for (input, expected_game_fmt) in test_cases {
            let date = Eu5Date::parse(input).unwrap();
            let date_only = date.date_fmt().to_string();
            let game_full = date.game_fmt().to_string();

            // date_fmt should always strip hour component
            assert_eq!(date_only, "1444-11-11");
            // game_fmt should preserve original format
            assert_eq!(game_full, expected_game_fmt);
        }
    }
}
