use crate::Vic3Date;
use serde::Deserialize;
use std::collections::HashMap;
use std::collections::VecDeque;

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
impl Iterator for Vic3CountryStatsIter<'_> {
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
                        // This is noisy, but leaving it here as a reminder that maybe something better can be done
                        //println!("{:?} and {:?} misallign, picking {:?} (WIP, maybe need to handle better)", date_next, date_b, date_next);
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
                        //println!("{:?} and {:?} misallign, picking {:?} (WIP, maybe need to handle better)", date_next, date_a, date_next);
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
/*
The idea of the code bellow is to flatten a tuple of structure
T1: E
T1: (T1, E)

Into array [E;N] for arbitrary N
*/
pub struct One;
pub struct Succ<T>(std::marker::PhantomData<T>);

pub trait Value {
    const N: usize;
}

impl Value for One {
    const N: usize = 1;
}

impl<T> Value for Succ<T>
where
    T: Value,
{
    const N: usize = 1 + T::N;
}

// N is the size of the output
// Idx keeps track at which position each recursion needs to insert
pub trait FlattenedTuple<const N: usize, Idx, Elem: std::marker::Copy>
where
    Idx: Value,
{
    fn flattened(self) -> [Elem; N];
}

impl<const N: usize, Elem: std::marker::Copy> FlattenedTuple<N, One, Elem> for Elem {
    fn flattened(self) -> [Elem; N] {
        let arr: [Elem; N] = [self; N];
        arr
    }
}

impl<const N: usize, T, Idx, Elem: std::marker::Copy> FlattenedTuple<N, Succ<Idx>, Elem>
    for (T, Elem)
where
    T: FlattenedTuple<N, Idx, Elem>,
    Idx: Value,
{
    fn flattened(self) -> [Elem; N] {
        let (rest, z) = self;
        let mut rec_arr = rest.flattened();
        rec_arr[Idx::N] = z;
        rec_arr
    }
}

fn flattened_iter<const N: usize, T, Idx, Itm>(
    iter: T,
) -> impl Iterator<Item = (Vic3Date, [f64; N])>
where
    T: Iterator<Item = (Vic3Date, Itm)>,
    Itm: FlattenedTuple<N, Idx, f64>,
    Idx: Value,
{
    // This should be encoded into the type system, but it's not for some
    // reason.
    assert!(Idx::N == N, "flattened_iter called with wrong types. Are you destructuring the right amount of elements?");
    iter.map(|(date, s)| (date, s.flattened()))
}
/* ======= */

// Computes GDP growth, based on growth from avg GDP in Q1 to avg GDP Q4
#[derive(Debug)]
pub struct Vic3StatsGDPIter<T> {
    gdp_stats: T,
    last_year: VecDeque<(Vic3Date, f64)>,
}

impl<T> Vic3StatsGDPIter<T> {
    pub fn new(gdp_stats: T) -> Vic3StatsGDPIter<T> {
        Vic3StatsGDPIter {
            gdp_stats,
            last_year: VecDeque::with_capacity(366),
        }
    }
}

impl<T1> Iterator for Vic3StatsGDPIter<T1>
where
    T1: Iterator<Item = (Vic3Date, f64)>,
{
    type Item = T1::Item;
    fn next(&mut self) -> Option<Self::Item> {
        // Vaguely based off https://www.investopedia.com/terms/r/realeconomicrate.asp
        self.last_year.push_back(self.gdp_stats.next()?);
        let (old_date, _old_gdp) = self.last_year.front()?;
        let (new_date, _new_gdp) = *self.last_year.back()?;

        if old_date.days_until(&new_date) < 365 {
            // Not enough data, return 0 gorwth
            return Some((new_date, 0.0));
        }
        let q1_idx = self
            .last_year
            .partition_point(|(date, _)| old_date.days_until(date) < 90);
        let q3_idx = self
            .last_year
            .partition_point(|(date, _)| old_date.days_until(date) < 270);
        let q1 = self.last_year.iter().take(q1_idx);
        let q4 = self.last_year.iter().skip(q3_idx);
        let q1_avg_gdp: f64 = q1.map(|(_, g)| g).sum::<f64>() / q1_idx as f64;
        let q4_avg_gdp: f64 =
            q4.map(|(_, g)| g).sum::<f64>() / ((self.last_year.len() - q3_idx) as f64);
        self.last_year.pop_front();
        Some((new_date, q4_avg_gdp / q1_avg_gdp - 1.0))
    }
}

#[derive(Debug)]
pub struct Vic3CountryStatsRateIter<T> {
    stats: T,
    days_back: i32,
    prev: Option<(Vic3Date, f64)>,
}

//Another way to compute GDP, but more jumpy
impl<T> Vic3CountryStatsRateIter<T> {
    pub fn new(stats: T, days_back: i32) -> Vic3CountryStatsRateIter<T> {
        Vic3CountryStatsRateIter {
            stats,
            days_back,
            prev: None,
        }
    }
}

impl<T1> Iterator for Vic3CountryStatsRateIter<T1>
where
    T1: Iterator<Item = (Vic3Date, f64)>,
{
    type Item = T1::Item;
    fn next(&mut self) -> Option<Self::Item> {
        if self.prev.is_none() {
            self.prev = self.stats.next();
        }

        let (prev_date, prev_x) = self.prev?;
        let (mut curr_date, mut x) = self.stats.next()?;
        while prev_date.days_until(&curr_date) < self.days_back {
            (curr_date, x) = self.stats.next()?;
        }
        self.prev = Some((curr_date, x));

        Some((curr_date, (x - prev_x) / prev_x))
    }
}

impl Vic3CountryStatsIter<'_> {
    pub fn zip_aligned<T, T1>(self, other: T1) -> Vic3CountryStatsAllignedIter<Self, T1>
    where
        T1: Iterator<Item = (Vic3Date, T)>,
    {
        Vic3CountryStatsAllignedIter { a: self, b: other }
    }
}

impl<A: Iterator, B: Iterator> Vic3CountryStatsAllignedIter<A, B> {
    pub fn zip_aligned<T, T1>(self, other: T1) -> Vic3CountryStatsAllignedIter<Self, T1>
    where
        T1: Iterator<Item = (Vic3Date, T)>,
    {
        Vic3CountryStatsAllignedIter { a: self, b: other }
    }
    pub fn flat<const N: usize, Idx, Itm>(self) -> impl Iterator<Item = (Vic3Date, [f64; N])>
    where
        Self: Iterator<Item = (Vic3Date, Itm)>,
        Itm: FlattenedTuple<N, Idx, f64>,
        Idx: Value,
    {
        flattened_iter(self)
    }
}

impl Vic3CountryStats {
    pub fn iter(&self) -> Vic3CountryStatsIter<'_> {
        Vic3CountryStatsIter {
            stats: self,
            index: 0,
        }
    }
    pub fn growth_rate(
        &self,
        days_back: i32,
    ) -> Vic3CountryStatsRateIter<Vic3CountryStatsIter<'_>> {
        Vic3CountryStatsRateIter {
            stats: self.iter(),
            days_back,
            prev: None,
        }
    }

    pub fn gdp_growth(&self) -> Vic3StatsGDPIter<Vic3CountryStatsIter<'_>> {
        Vic3StatsGDPIter::new(self.iter())
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

    #[test]
    fn test_flatten() {
        let date = Vic3Date::from_ymdh(1836, 1, 1, 0);
        let t1: ((f64, f64), f64) = ((1.0, 2.0), 3.0);
        let [x, y, z]: [f64; 3] = t1.flattened();
        assert_eq!(x, 1.0);
        assert_eq!(y, 2.0);
        assert_eq!(z, 3.0);
        let t1_vec = [(date, t1), (date, t1), (date, t1)];
        let t1_flat: Vec<f64> = flattened_iter(t1_vec.iter().copied())
            .map(|(_, [_, y, _])| y)
            .collect();
        assert_eq!(vec![2.0, 2.0, 2.0], t1_flat);
        let t2: (_, f64) = (t1, 0.0);
        let [_, _y, _z, x]: [f64; 4] = t2.flattened();
        assert_eq!(x, 0.0);
        let t2_vec = [(date, t2), (date, t2), (date, t2)];
        let t2_flat: Vec<f64> = flattened_iter(t2_vec.iter().copied())
            .map(|(_, [_, _, y, _])| y)
            .collect();
        assert_eq!(vec![3.0, 3.0, 3.0], t2_flat);

        let t3: (_, f64) = (t2, 0.0);
        let t3_vec = [(date, t3), (date, t3), (date, t3)];
        assert_eq!(x, 0.0);
        let t3_flat: Vec<f64> = flattened_iter(t3_vec.iter().copied())
            .map(|(_, [_, _, y, _, _])| y)
            .collect();
        assert_eq!(vec![3.0, 3.0, 3.0], t3_flat);
    }
    #[test]
    fn test_growth_rate() {
        let date = Vic3Date::from_ymdh(1836, 1, 1, 0);
        let stats: Vec<(Vic3Date, f64)> = vec![
            (date.add_days(0), 1.0),
            (date.add_days(365), 1.2),
            (date.add_days(730), 1.44),
            (date.add_days(1095), 2.0736),
            (date.add_days(1460), 4.1472),
        ];
        let rate_iter = Vic3CountryStatsRateIter {
            stats: stats.iter().copied(),
            days_back: 365,
            prev: None,
        };
        let (_, rate): (Vec<_>, Vec<_>) = rate_iter.unzip();
        assert_eq!(vec![0.19999999999999996, 0.2, 0.44, 1.0], rate);
    }

    #[test]
    fn test_gdp_growth_rate() {
        let date = Vic3Date::from_ymdh(1836, 1, 1, 0);
        let stats: Vec<(Vic3Date, f64)> = vec![
            (date.add_days(0), 1.0),
            (date.add_days(90), 1.0),
            (date.add_days(180), 1.1),
            (date.add_days(270), 1.4),
            (date.add_days(365), 1.4),
            (date.add_days(455), 1.4),
            (date.add_days(545), 1.4),
        ];
        let rate_iter = Vic3StatsGDPIter::new(stats.iter().copied());
        let (_, rate): (Vec<_>, Vec<_>) = rate_iter.unzip();
        assert_eq!(
            vec![
                0.0,
                0.0,
                0.0,
                0.0,
                0.3999999999999999,
                0.3999999999999999,
                0.2727272727272725
            ],
            rate
        );
    }

    use std::iter::{repeat, successors};
    #[test]
    fn test_exp_growth_rate() {
        let date = Vic3Date::from_ymdh(1836, 1, 1, 0);
        let ex = || successors(Some(1.0), |n| Some(n + 1.0)).map(|n: f64| n.exp());
        const N: usize = 20;
        let days = |add| successors(Some(date), move |d| Some((*d).add_days(add)));
        let exp_stats = days(365).take(N).zip(ex());
        let rate_iter = Vic3CountryStatsRateIter {
            stats: exp_stats,
            days_back: 365,
            prev: None,
        };
        let diff = rate_iter
            .map(|(_date, rate)| rate)
            .zip(repeat(std::f64::consts::E).map(|n| n - 1.0))
            .map(|(l, r)| (l - r).abs())
            .filter(|n| n < &0.00001);
        assert_eq!(N - 1, diff.count());
    }
}
