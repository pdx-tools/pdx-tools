use crate::{R16, World, WorldPoint};
use std::fmt::{self, Display};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aabb {
    min: WorldPoint<u16>,
    max: WorldPoint<u16>,
}

impl Aabb {
    pub fn empty() -> Self {
        Self {
            min: WorldPoint::new(u16::MAX, u16::MAX),
            max: WorldPoint::new(0, 0),
        }
    }

    pub fn new(min: WorldPoint<u16>, max: WorldPoint<u16>) -> Self {
        Self { min, max }
    }

    pub fn expand_to(&mut self, point: WorldPoint<u16>) {
        self.min.x = self.min.x.min(point.x);
        self.min.y = self.min.y.min(point.y);
        self.max.x = self.max.x.max(point.x);
        self.max.y = self.max.y.max(point.y);
    }

    #[inline]
    pub fn min(&self) -> WorldPoint<u16> {
        self.min
    }

    #[inline]
    pub fn max(&self) -> WorldPoint<u16> {
        self.max
    }

    #[inline]
    pub fn intersects(&self, other: &Self) -> bool {
        (self.min.x <= other.max.x)
            & (self.max.x >= other.min.x)
            & (self.min.y <= other.max.y)
            & (self.max.y >= other.min.y)
    }
}

impl Display for Aabb {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}-{}]", self.min, self.max)
    }
}

#[derive(Debug)]
pub struct SpatialIndex {
    aabbs: Vec<Aabb>,
}

impl SpatialIndex {
    pub fn from_world(world: &World<R16>) -> Self {
        let hemisphere_width = world.west().size().width as usize;

        let mut min_x = vec![u16::MAX; u16::MAX as usize + 1];
        let mut min_y = vec![u16::MAX; u16::MAX as usize + 1];
        let mut max_x = vec![0u16; u16::MAX as usize + 1];
        let mut max_y = vec![0u16; u16::MAX as usize + 1];
        let mut max_location = R16::new(0);

        let mut update_run = |loc: R16, start_x: u16, end_x: u16, y: u16| {
            let idx = loc.value() as usize;
            min_x[idx] = min_x[idx].min(start_x);
            max_x[idx] = max_x[idx].max(end_x);
            min_y[idx] = min_y[idx].min(y);
            max_y[idx] = max_y[idx].max(y);
            max_location = max_location.max(loc);
        };

        for (row, chunk) in world.west().rows().enumerate() {
            let y = row as u16;
            if chunk.is_empty() {
                continue;
            }

            let mut run_id = chunk[0];
            let mut run_start = 0u16;
            for (col, r16) in chunk.iter().enumerate().skip(1) {
                if *r16 != run_id {
                    let end_x = (col - 1) as u16;
                    update_run(run_id, run_start, end_x, y);
                    run_id = *r16;
                    run_start = col as u16;
                }
            }

            let end_x = (hemisphere_width - 1) as u16;
            update_run(run_id, run_start, end_x, y);
        }

        for (row, chunk) in world.east().rows().enumerate() {
            let y = row as u16;
            if chunk.is_empty() {
                continue;
            }

            let x_offset = hemisphere_width as u16;
            let mut run_id = chunk[0];
            let mut run_start = x_offset;
            for (col, r16) in chunk.iter().enumerate().skip(1) {
                if *r16 != run_id {
                    let end_x = x_offset + (col as u16) - 1;
                    update_run(run_id, run_start, end_x, y);
                    run_id = *r16;
                    run_start = x_offset + col as u16;
                }
            }

            let end_x = x_offset + (hemisphere_width as u16) - 1;
            update_run(run_id, run_start, end_x, y);
        }

        let aabbs = (0..=max_location.value() as usize)
            .map(|idx| {
                Aabb::new(
                    WorldPoint::new(min_x[idx], min_y[idx]),
                    WorldPoint::new(max_x[idx], max_y[idx]),
                )
            })
            .collect();

        Self { aabbs }
    }

    pub fn query(&self, query_aabb: Aabb) -> impl Iterator<Item = R16> + '_ {
        self.aabbs
            .iter()
            .enumerate()
            .filter_map(move |(idx, aabb)| {
                if aabb.intersects(&query_aabb) {
                    Some(R16::new(idx as u16))
                } else {
                    None
                }
            })
    }

    pub fn aabb_of(&self, loc: R16) -> Aabb {
        self.aabbs[loc.value() as usize]
    }

    pub fn len(&self) -> usize {
        self.aabbs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.aabbs.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Hemisphere, units::HemisphereLength};

    fn world_from_halves(west: Vec<u16>, east: Vec<u16>, hemisphere_width: u32) -> World<R16> {
        let west = west.into_iter().map(R16::new).collect::<Vec<_>>();
        let east = east.into_iter().map(R16::new).collect::<Vec<_>>();

        World::new(
            Hemisphere::new(west, HemisphereLength::new(hemisphere_width)),
            Hemisphere::new(east, HemisphereLength::new(hemisphere_width)),
        )
    }

    #[test]
    fn test_aabb_size() {
        use std::mem::size_of;

        assert_eq!(size_of::<Aabb>(), 8);
        assert_eq!(size_of::<WorldPoint<u16>>(), 4);
    }

    #[test]
    fn test_aabb_new() {
        let aabb = Aabb::new(WorldPoint::new(10, 20), WorldPoint::new(30, 40));
        assert_eq!(aabb.min(), WorldPoint::new(10, 20));
        assert_eq!(aabb.max(), WorldPoint::new(30, 40));
    }

    #[test]
    fn test_aabb_expand() {
        let mut aabb = Aabb::new(WorldPoint::new(10, 10), WorldPoint::new(11, 11));

        aabb.expand_to(WorldPoint::new(30, 15));
        assert_eq!(aabb.min(), WorldPoint::new(10, 10));
        assert_eq!(aabb.max(), WorldPoint::new(30, 15));

        aabb.expand_to(WorldPoint::new(5, 5));
        assert_eq!(aabb.min(), WorldPoint::new(5, 5));
        assert_eq!(aabb.max(), WorldPoint::new(30, 15));
    }

    #[test]
    fn test_aabb_intersects() {
        let aabb1 = Aabb::new(WorldPoint::new(10, 10), WorldPoint::new(20, 20));
        let aabb2 = Aabb::new(WorldPoint::new(15, 15), WorldPoint::new(25, 25));
        let aabb3 = Aabb::new(WorldPoint::new(30, 30), WorldPoint::new(40, 40));

        assert!(aabb1.intersects(&aabb2));
        assert!(aabb2.intersects(&aabb1));

        assert!(!aabb1.intersects(&aabb3));
        assert!(!aabb3.intersects(&aabb1));

        let aabb4 = Aabb::new(WorldPoint::new(20, 20), WorldPoint::new(30, 30));
        assert!(aabb1.intersects(&aabb4));
    }

    #[test]
    fn test_aabb_display() {
        let aabb = Aabb::new(WorldPoint::new(10, 20), WorldPoint::new(100, 80));
        assert_eq!(format!("{}", aabb), "[(10,20)-(100,80)]");
    }

    #[test]
    fn test_aabb_index_construction() {
        let world = world_from_halves(vec![0, 1, 2, 3], vec![4, 5, 6, 7], 2);
        let index = world.build_spatial_index();

        assert_eq!(index.len(), 8);

        let aabb = index.aabb_of(R16::new(0));
        assert_eq!(aabb.min(), WorldPoint::new(0, 0));
        assert_eq!(aabb.max(), WorldPoint::new(0, 0));

        let aabb = index.aabb_of(R16::new(1));
        assert_eq!(aabb.min(), WorldPoint::new(1, 0));
        assert_eq!(aabb.max(), WorldPoint::new(1, 0));

        let aabb = index.aabb_of(R16::new(4));
        assert_eq!(aabb.min(), WorldPoint::new(2, 0));
        assert_eq!(aabb.max(), WorldPoint::new(2, 0));
    }

    #[test]
    fn test_aabb_index_query() {
        let world = world_from_halves(vec![0, 1, 2, 3], vec![4, 5, 6, 7], 2);
        let index = world.build_spatial_index();

        let query = Aabb::new(WorldPoint::new(0, 0), WorldPoint::new(1, 1));
        let results = index.query(query).collect::<Vec<_>>();

        assert!(results.contains(&R16::new(0)));
        assert!(results.contains(&R16::new(1)));
        assert!(results.contains(&R16::new(2)));
        assert!(results.contains(&R16::new(3)));

        assert!(!results.contains(&R16::new(4)));
        assert!(!results.contains(&R16::new(5)));
    }

    #[test]
    fn test_aabb_index_multi_pixel_locations() {
        let world = world_from_halves(vec![0, 0, 0, 0], vec![1, 1, 1, 1], 2);
        let index = world.build_spatial_index();

        let aabb = index.aabb_of(R16::new(0));
        assert_eq!(aabb.min(), WorldPoint::new(0, 0));
        assert_eq!(aabb.max(), WorldPoint::new(1, 1));

        let aabb = index.aabb_of(R16::new(1));
        assert_eq!(aabb.min(), WorldPoint::new(2, 0));
        assert_eq!(aabb.max(), WorldPoint::new(3, 1));
    }
}
