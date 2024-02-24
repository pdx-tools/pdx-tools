use crate::Vic3Date;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize, PartialEq)]
pub struct VicStatsChannel {
    // Date of last sample
    pub date: Vic3Date,
    //  next free index (number of samples + 1)
    pub index: i32,
    // Value
    pub values: Vec<f64>,
}
#[derive(Debug, Deserialize, PartialEq)]
pub struct Vic3CountryStats {
    // Sample rate of ticks (sample rate of 28, works to 1 week)
    pub sample_rate: i32,
    // Not sure, double the index?
    pub count: i32,
    #[serde(default)]
    pub channels: HashMap<i32, VicStatsChannel>,
}

#[derive(Debug)]
pub struct Vic3CountryStatsIter<'a> {
    stats: &'a Vic3CountryStats,
    index: usize,
}
impl<'a> Iterator for Vic3CountryStatsIter<'a> {
    type Item = (Vic3Date, f64);
    fn next(&mut self) -> Option<Self::Item> {
        let game_start_date: Vic3Date = Vic3Date::from_ymdh(1836, 1, 1, 0);
        let channel = self.stats.channels.get(&0)?;
        let days_between_start_and_end = game_start_date.days_until(&channel.date);
        let days_per_index = self.stats.sample_rate / 4;
        let days_to_start_date = days_between_start_and_end - (channel.index * days_per_index);
        let start_date = game_start_date.add_days(days_to_start_date + 1);
        if self.index + 1 >= (channel.index as usize) {
            return None;
        }
        let elem = channel.values.get(self.index)?;
        self.index += 1;

        let new_date = start_date.add_days(self.index as i32 * days_per_index);
        Some((new_date, *elem))
    }
}

#[derive(Debug)]
pub struct Vic3CountryStatsAllignedIter<T1, T2> {
    a: T1,
    b: T2,
}
impl<A, B, T1, T2> Iterator for Vic3CountryStatsAllignedIter<T1, T2>
where
    T1: Iterator<Item = (Vic3Date, A)>,
    T2: Iterator<Item = (Vic3Date, B)>,
{
    type Item = (Vic3Date, (A, B));
    fn next(&mut self) -> Option<Self::Item> {
        match (self.a.next(), self.b.next()) {
            (Some((date_a, x)), Some((date_b, y))) if date_a == date_b => Some((date_a, (x, y))),
            (Some((date_a, x)), Some((date_b, y))) if date_a < date_b => {
                let mut prev_date = date_a;
                let mut prev_x = x;
                loop {
                    let Some((date_next, x1)) = self.a.next() else {
                        println!("iterator empty equal");
                        return Some((prev_date, (prev_x, y)));
                    };
                    if date_next == date_b {
                        return Some((date_b, (x1, y)));
                    }

                    if date_next > date_b {
                        println!("{:?} and {:?} misallign, picking {:?} (WIP, maybe need to handle better)", date_next, date_b, date_next);
                        return Some((date_next, (x1, y)));
                    }
                    prev_date = date_next;
                    prev_x = x1;
                }
            }
            (Some((date_a, x)), Some((date_b, y))) if date_b < date_a => {
                let mut prev_date = date_b;
                let mut prev_y = y;
                loop {
                    let Some((date_next, y1)) = self.b.next() else {
                        return Some((prev_date, (x, prev_y)));
                    };
                    if date_next == date_a {
                        return Some((date_a, (x, y1)));
                    }

                    if date_next > date_a {
                        println!("{:?} and {:?} misallign, picking {:?} (WIP, maybe need to handle better)", date_next, date_a, date_next);
                        return Some((date_next, (x, y1)));
                    }
                    prev_date = date_next;
                    prev_y = y1;
                }
            }
            _ => None,
        }
    }
}

impl<'a> Vic3CountryStatsIter<'a> {
    pub fn zip_aligned<T, T1>(self, other: T1) -> Vic3CountryStatsAllignedIter<Self, T1>
    where
        T1: Iterator<Item = (Vic3Date, T)>,
    {
        Vic3CountryStatsAllignedIter { a: self, b: other }
    }
}
impl<A, B> Vic3CountryStatsAllignedIter<A, B> {
    pub fn zip_aligned<T, T1>(self, other: T1) -> Vic3CountryStatsAllignedIter<Self, T1>
    where
        T1: Iterator<Item = (Vic3Date, T)>,
    {
        Vic3CountryStatsAllignedIter { a: self, b: other }
    }
}

impl Vic3CountryStats {
    pub fn iter(&self) -> Vic3CountryStatsIter {
        Vic3CountryStatsIter {
            stats: self,
            index: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::Vic3CountryStats;
    use jomini::text::de::from_utf8_slice;
    use serde::Deserialize;

    #[derive(Debug, Deserialize, PartialEq)]
    struct TestCountryForStats {
        gdp: Vic3CountryStats,
    }
    const TEST_STATS: &[u8] = br#"gdp={
				sample_rate=28
				count=4
				channels={
					0={
						date=1836.1.28
						index=4
						values={
							1194501.51448 1194520.51448 1194300.51448 
						}
					}
				}
}"#;

    #[test]
    fn test_country_stats() {
        let stats: TestCountryForStats = from_utf8_slice(TEST_STATS).expect("test");
        assert_eq!(stats.gdp.sample_rate, 28);
        let (_dates, values): (Vec<_>, Vec<_>) = stats.gdp.iter().unzip();
        println!("Into iter {:?}", values);
        assert_eq!(vec![1194501.51448, 1194520.51448, 1194300.51448], values);
    }

    #[test]
    fn test_stats_align_multiple_sample_rate() {
        let date = Vic3Date::from_ymdh(1836, 1, 1, 0);
        let stats_a: Vec<(Vic3Date, i32)> = vec![
            (date.add_days(0), 1),
            (date.add_days(2), 1),
            (date.add_days(4), 1),
            (date.add_days(6), 1),
            (date.add_days(8), 1),
            (date.add_days(10), 1),
            (date.add_days(12), 1),
        ];
        let stats_b: Vec<(Vic3Date, i32)> = vec![
            (date.add_days(0), 1),
            (date.add_days(4), 1),
            (date.add_days(8), 1),
        ];

        let zip_a_b = Vic3CountryStatsAllignedIter {
            a: stats_a.iter().copied(),
            b: stats_b.iter().copied(),
        };
        let zip_b_a = Vic3CountryStatsAllignedIter {
            b: stats_a.iter().copied(),
            a: stats_b.iter().copied(),
        };
        let zipped_a_b: Vec<_> = zip_a_b.collect();
        let zipped_b_a: Vec<_> = zip_b_a.collect();
        assert_eq!(3, zipped_a_b.len());
        assert_eq!(zipped_b_a.len(), zipped_a_b.len());
    }

    #[test]
    fn test_stats_align_non_multiple_sample_rate() {
        let date = Vic3Date::from_ymdh(1836, 1, 1, 0);
        let stats_a: Vec<(Vic3Date, i32)> = vec![
            (date.add_days(0), 1),
            (date.add_days(2), 1),
            (date.add_days(4), 1),
            (date.add_days(6), 1),
            (date.add_days(8), 1),
            (date.add_days(10), 1),
            (date.add_days(12), 1),
        ];
        let stats_b: Vec<(Vic3Date, i32)> = vec![
            (date.add_days(0), 1),
            (date.add_days(3), 1),
            (date.add_days(6), 1),
            (date.add_days(9), 1),
            (date.add_days(12), 1),
        ];

        let zip_a_b = Vic3CountryStatsAllignedIter {
            a: stats_a.iter().copied(),
            b: stats_b.iter().copied(),
        };
        let zip_b_a = Vic3CountryStatsAllignedIter {
            b: stats_a.iter().copied(),
            a: stats_b.iter().copied(),
        };
        let zipped_a_b: Vec<_> = zip_a_b.collect();
        let zipped_b_a: Vec<_> = zip_b_a.collect();
        println!("Into iter {:?}", zipped_a_b);
        assert_eq!(5, zipped_a_b.len());
        assert_eq!(zipped_b_a.len(), zipped_a_b.len());
    }

    #[test]
    fn test_stats_align_same_len() {
        let stats_a: TestCountryForStats = from_utf8_slice(TEST_STATS).expect("test");
        let stats_b: TestCountryForStats = from_utf8_slice(TEST_STATS).expect("test");
        let zip = stats_b.gdp.iter().zip_aligned(stats_a.gdp.iter());
        let zipped: Vec<_> = zip.collect();
        println!("Into iter {:?}", zipped);
        assert_eq!(3, zipped.len());
    }
}
