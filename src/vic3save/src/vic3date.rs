pub use jomini::common::PdsDate;
use jomini::common::{DateError, DateFormat, PdsDateFormatter, RawDate};
use std::str::FromStr;

const DAYS_PER_MONTH: [u8; 13] = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/// A date without a time component
///
/// See [RawDate] for additional date / time commentary
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Vic3Date {
    raw: RawDate,
}

impl std::fmt::Debug for Vic3Date {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Date {}", self.game_fmt())
    }
}

impl Vic3Date {
    fn from_raw(raw: RawDate) -> Option<Self> {
        let days = DAYS_PER_MONTH[usize::from(raw.month())];
        if raw.day() <= days {
            if matches!(raw.hour(), 0 | 6 | 12 | 18) {
                return Some(Vic3Date { raw });
            }
        }

        None
    }

    /// Create a raw date from individual components.
    ///
    /// Will return none for an invalid date
    pub fn from_ymdh_opt(year: i16, month: u8, day: u8, hour: u8) -> Option<Self> {
        RawDate::from_ymdh_opt(year, month, day, hour).and_then(Self::from_raw)
    }

    /// Create a raw date from individual components.
    ///
    /// Will panic on invalid dates
    pub fn from_ymdh(year: i16, month: u8, day: u8, hour: u8) -> Self {
        Self::from_ymdh_opt(year, month, day, hour).unwrap()
    }

    /// Parses a string and returns a new [`Date`] if valid. The expected
    /// format is either YYYY.MM.DD or a number representing of the equivalent
    /// binary representation.
    ///
    /// ```
    /// use vic3save::{Vic3Date, PdsDate};
    /// let date = Vic3Date::parse("1836.2.3.6").expect("to parse date");
    /// assert_eq!(date.year(), 1836);
    /// assert_eq!(date.month(), 2);
    /// assert_eq!(date.day(), 3);
    /// assert_eq!(date.hour(), 6);
    /// ```
    pub fn parse<T: AsRef<[u8]>>(s: T) -> Result<Self, DateError> {
        let date = RawDate::parse(s)?;
        Self::from_raw(date).ok_or(DateError)
    }

    /// Decodes a date from a number that had been parsed from binary data
    pub fn from_binary(s: i32) -> Option<Self> {
        RawDate::from_binary(s).and_then(Self::from_raw)
    }

    pub fn from_binary_heuristic(s: i32) -> Option<Self> {
        RawDate::from_binary(s).and_then(|x| {
            if x.year() > 1700 {
                Self::from_raw(x)
            } else {
                None
            }
        })
    }

    /// Date hour. Can be 0, 6, 12, or 18.
    pub fn hour(&self) -> u8 {
        self.raw.hour()
    }
}

impl PdsDate for Vic3Date {
    /// Year of the date
    ///
    /// ```
    /// use vic3save::{Vic3Date, PdsDate};
    /// let date = Vic3Date::from_ymdh(1936, 2, 3, 0);
    /// assert_eq!(date.year(), 1936);
    /// ```
    fn year(&self) -> i16 {
        self.raw.year()
    }

    /// Month of the date
    ///
    /// ```
    /// use vic3save::{Vic3Date, PdsDate};
    /// let date = Vic3Date::from_ymdh(1936, 2, 3, 0);
    /// assert_eq!(date.month(), 2);
    /// ```
    fn month(&self) -> u8 {
        self.raw.month()
    }

    /// Day of the date
    ///
    /// ```
    /// use vic3save::{Vic3Date, PdsDate};
    /// let date = Vic3Date::from_ymdh(1936, 2, 3, 0);
    /// assert_eq!(date.day(), 3);
    /// ```
    fn day(&self) -> u8 {
        self.raw.day()
    }

    /// Formats a date in the ISO 8601 format: YYYY-MM-DD
    ///
    /// ```
    /// use vic3save::{Vic3Date, PdsDate};
    /// let date = Vic3Date::from_ymdh(1936, 2, 3, 0);
    /// assert_eq!(date.iso_8601().to_string(), String::from("1936-02-03T00"));
    ///
    /// let date = Vic3Date::from_ymdh(1936, 2, 3, 6);
    /// assert_eq!(date.iso_8601().to_string(), String::from("1936-02-03T06"));
    /// ```
    fn iso_8601(&self) -> PdsDateFormatter {
        let new = RawDate::from_ymdh(self.year(), self.month(), self.day(), self.hour() + 1);
        PdsDateFormatter::new(new, DateFormat::Iso8601)
    }

    /// Formats a date in the game format: Y.M.D
    ///
    /// ```
    /// use vic3save::{Vic3Date, PdsDate};
    /// let date = Vic3Date::from_ymdh(1936, 2, 3, 0);
    /// assert_eq!(date.game_fmt().to_string(), String::from("1936.2.3"));
    ///
    /// let date = Vic3Date::from_ymdh(1936, 2, 3, 6);
    /// assert_eq!(date.game_fmt().to_string(), String::from("1936.2.3.6"));
    /// ```
    fn game_fmt(&self) -> PdsDateFormatter {
        PdsDateFormatter::new(self.raw, DateFormat::DotShort)
    }
}

impl FromStr for Vic3Date {
    type Err = DateError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s.as_bytes())
    }
}
