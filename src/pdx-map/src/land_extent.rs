use crate::{WorldPoint, WorldRect, WorldSize};

/// A gap wider than this share of the world width splits land into clusters.
const CLUSTER_GAP: f32 = 0.05;

/// A cluster stays in the extent when it has at least 1 / `CLUSTER_SHARE` of
/// the points of the largest cluster.
const CLUSTER_SHARE: usize = 2;

/// The area that holds the main land of each group, on a world that wraps
/// from east to west. In each group, a small cluster far from the rest, such
/// as a colony, is left out, because a frame across an ocean shows little of
/// the land. A group is never left out, so a small group next to a large one
/// stays in the area.
///
/// The area goes the short way around the world, so its origin can be west of
/// zero or its end east of `world_width`. None when there are no points.
pub fn land_extent<'a>(
    groups: impl IntoIterator<Item = &'a [WorldPoint<f32>]>,
    world_width: f32,
) -> Option<WorldRect<f32>> {
    let rects: Vec<WorldRect<f32>> = groups
        .into_iter()
        .filter_map(|points| group_extent(points, world_width))
        .collect();

    // Start the span at the west edge of each area in turn, move the other
    // areas east by whole worlds to follow it, and keep the narrowest span.
    let (x0, x1) = rects
        .iter()
        .map(|start| {
            let x0 = start.origin.x;
            let x1 = rects
                .iter()
                .map(|rect| {
                    let shift = ((x0 - rect.origin.x) / world_width).ceil() * world_width;
                    rect.origin.x + shift + rect.size.width
                })
                .fold(f32::NEG_INFINITY, f32::max);
            (x0, x1)
        })
        .min_by(|a, b| (a.1 - a.0).total_cmp(&(b.1 - b.0)))?;
    let y0 = rects
        .iter()
        .map(|r| r.origin.y)
        .fold(f32::INFINITY, f32::min);
    let y1 = rects
        .iter()
        .map(|r| r.origin.y + r.size.height)
        .fold(f32::NEG_INFINITY, f32::max);
    let width = (x1 - x0).min(world_width);
    let x0 = (x0 + x1 - width) / 2.0;
    Some(WorldRect::new(
        WorldPoint::new(x0, y0),
        WorldSize::new(width, y1 - y0),
    ))
}

fn group_extent(points: &[WorldPoint<f32>], world_width: f32) -> Option<WorldRect<f32>> {
    if points.is_empty() {
        return None;
    }
    let gap = world_width * CLUSTER_GAP;

    let mut points = points.to_vec();
    points.sort_by(|a, b| a.x.total_cmp(&b.x));
    let xs: Vec<f32> = points.iter().map(|p| p.x).collect();
    let shifts = unwrap_shifts(&xs, world_width);
    let mut points: Vec<WorldPoint<f32>> = points
        .iter()
        .zip(&shifts)
        .map(|(p, shift)| WorldPoint::new(p.x + shift, p.y))
        .collect();
    points.sort_by(|a, b| a.x.total_cmp(&b.x));
    let mut points = main_clusters(&points, |p| p.x, gap);

    // A colony can be at the same longitude as its country, so also split
    // the land from north to south.
    points.sort_by(|a, b| a.y.total_cmp(&b.y));
    let points = main_clusters(&points, |p| p.y, gap);

    let (mut x0, mut x1) = (f32::INFINITY, f32::NEG_INFINITY);
    let (mut y0, mut y1) = (f32::INFINITY, f32::NEG_INFINITY);
    for p in &points {
        x0 = x0.min(p.x);
        x1 = x1.max(p.x);
        y0 = y0.min(p.y);
        y1 = y1.max(p.y);
    }
    Some(WorldRect::new(
        WorldPoint::new(x0, y0),
        WorldSize::new(x1 - x0, y1 - y0),
    ))
}

/// For values sorted from west to east, the shift by a whole world that each
/// value gets so that the walk starts after the widest gap, which can be the
/// gap across the east edge of the world. Values before the start move one
/// world east.
fn unwrap_shifts(sorted: &[f32], world_width: f32) -> Vec<f32> {
    let n = sorted.len();
    let gap_after = |i: usize| match sorted.get(i + 1) {
        Some(next) => next - sorted[i],
        None => sorted[0] + world_width - sorted[i],
    };
    let widest = (0..n)
        .max_by(|&a, &b| gap_after(a).total_cmp(&gap_after(b)))
        .unwrap_or(0);
    (0..n)
        .map(|i| {
            if i <= widest && widest + 1 < n {
                world_width
            } else {
                0.0
            }
        })
        .collect()
}

/// The points of the clusters that are not much smaller than the largest.
/// The points are sorted by `key`.
fn main_clusters(
    sorted: &[WorldPoint<f32>],
    key: impl Fn(&WorldPoint<f32>) -> f32,
    gap: f32,
) -> Vec<WorldPoint<f32>> {
    let clusters: Vec<&[WorldPoint<f32>]> =
        sorted.chunk_by(|a, b| key(b) - key(a) <= gap).collect();
    let largest = clusters.iter().map(|c| c.len()).max().unwrap_or(0);
    clusters
        .into_iter()
        .filter(|c| c.len() * CLUSTER_SHARE >= largest)
        .flatten()
        .copied()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORLD: f32 = 8192.0;

    fn line(x: f32, y: f32, n: usize) -> Vec<WorldPoint<f32>> {
        (0..n).map(|i| WorldPoint::new(x + i as f32, y)).collect()
    }

    fn extent(groups: &[Vec<WorldPoint<f32>>]) -> WorldRect<f32> {
        land_extent(groups.iter().map(Vec::as_slice), WORLD).unwrap()
    }

    #[test]
    fn no_points_have_no_extent() {
        assert_eq!(land_extent([&[][..]], WORLD), None);
        assert_eq!(land_extent(std::iter::empty(), WORLD), None);
    }

    #[test]
    fn an_extent_goes_the_short_way_around_the_world() {
        let points = vec![
            WorldPoint::new(WORLD - 10.0, 0.0),
            WorldPoint::new(10.0, 0.0),
        ];
        let rect = extent(&[points]);
        assert_eq!(rect.size.width, 20.0);
        assert_eq!(rect.center().x, WORLD);
    }

    #[test]
    fn a_far_colony_is_left_out() {
        let mut points = line(500.0, 300.0, 20);
        points.push(WorldPoint::new(5000.0, 900.0));
        let rect = extent(&[points]);
        assert_eq!(rect.size.width, 19.0);
        assert_eq!(rect.size.height, 0.0);
    }

    #[test]
    fn a_colony_at_the_same_longitude_is_left_out() {
        let mut points = line(500.0, 300.0, 20);
        points.push(WorldPoint::new(505.0, 4000.0));
        let rect = extent(&[points]);
        assert_eq!(rect.origin.y, 300.0);
        assert_eq!(rect.size.height, 0.0);
    }

    #[test]
    fn two_large_clusters_stay() {
        let mut points = line(1000.0, 0.0, 20);
        points.extend(line(3000.0, 0.0, 15));
        let rect = extent(&[points]);
        assert_eq!(rect.size.width, 2014.0);
    }

    #[test]
    fn a_small_group_next_to_a_large_one_stays() {
        let large = line(1000.0, 0.0, 200);
        let small = vec![WorldPoint::new(3000.0, 100.0)];
        let rect = extent(&[large, small]);
        assert_eq!(rect.origin.x, 1000.0);
        assert_eq!(rect.size.width, 2000.0);
        assert_eq!(rect.size.height, 100.0);
    }

    #[test]
    fn the_span_starts_after_the_widest_gap_between_areas() {
        // On a world 1000 wide, 820..1400 holds all three areas.
        let wide = vec![
            WorldPoint::new(0.0, 0.0),
            WorldPoint::new(40.0, 0.0),
            WorldPoint::new(400.0, 0.0),
        ];
        let groups = [
            wide,
            vec![WorldPoint::new(500.0, 0.0)],
            vec![WorldPoint::new(820.0, 0.0)],
        ];
        let rect = land_extent(groups.iter().map(Vec::as_slice), 1000.0).unwrap();
        assert_eq!(rect.origin.x, 820.0);
        assert_eq!(rect.size.width, 680.0);
    }

    #[test]
    fn groups_join_across_the_east_edge() {
        let west = line(10.0, 0.0, 5);
        let east = line(WORLD - 30.0, 0.0, 5);
        let rect = extent(&[west, east]);
        assert_eq!(rect.size.width, 44.0);
        assert_eq!(rect.origin.x, WORLD - 30.0);
    }
}
