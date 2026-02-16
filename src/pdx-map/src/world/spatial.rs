use crate::{R16, World, WorldPoint};
use std::fmt::{self, Display};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aabb {
    min: WorldPoint<u16>,
    max: WorldPoint<u16>,
}

impl Aabb {
    pub const fn empty() -> Self {
        Self {
            min: WorldPoint::new(u16::MAX, u16::MAX),
            max: WorldPoint::new(0, 0),
        }
    }

    pub const fn new(min: WorldPoint<u16>, max: WorldPoint<u16>) -> Self {
        Self { min, max }
    }

    fn expand_to(&mut self, start_x: u16, end_x: u16, y: u16) {
        self.min.x = self.min.x.min(start_x);
        self.min.y = self.min.y.min(y);
        self.max.x = self.max.x.max(end_x);
        self.max.y = self.max.y.max(y);
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
    pub fn from_world(world: &World) -> Self {
        let hemisphere_width = world.west().size().width as usize;
        let location_capacity = world.location_capacity();

        let mut bounds = vec![Aabb::empty(); location_capacity];
        for (row, chunk) in world.west().rows().enumerate() {
            let y = row as u16;
            let Some((run_id, rest)) = chunk.split_first() else {
                continue;
            };

            let mut run_id = *run_id;
            let mut run_start = 0u16;
            for (col, &r16) in rest.iter().enumerate() {
                if r16 != run_id {
                    let end_x = col as u16;
                    bounds[run_id.value() as usize].expand_to(run_start, end_x, y);
                    run_id = r16;
                    run_start = (col + 1) as u16;
                }
            }

            let end_x = (hemisphere_width - 1) as u16;
            bounds[run_id.value() as usize].expand_to(run_start, end_x, y);
        }

        for (row, chunk) in world.east().rows().enumerate() {
            let y = row as u16;
            let Some((run_id, rest)) = chunk.split_first() else {
                continue;
            };

            let x_offset = hemisphere_width as u16;
            let mut run_id = *run_id;
            let mut run_start = x_offset;
            for (col, &r16) in rest.iter().enumerate() {
                if r16 != run_id {
                    let end_x = x_offset + (col as u16);
                    bounds[run_id.value() as usize].expand_to(run_start, end_x, y);
                    run_id = r16;
                    run_start = x_offset + (col + 1) as u16;
                }
            }

            let end_x = x_offset + (hemisphere_width as u16) - 1;
            bounds[run_id.value() as usize].expand_to(run_start, end_x, y);
        }

        Self { aabbs: bounds }
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

    fn world_from_halves(west: Vec<u16>, east: Vec<u16>, hemisphere_width: u32) -> World {
        let west = west.into_iter().map(R16::new).collect::<Vec<_>>();
        let east = east.into_iter().map(R16::new).collect::<Vec<_>>();

        World::builder(
            Hemisphere::new(west, HemisphereLength::new(hemisphere_width)),
            Hemisphere::new(east, HemisphereLength::new(hemisphere_width)),
        )
        .build()
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
