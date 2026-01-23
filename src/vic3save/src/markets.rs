use mathru::algebra::linear::{
    matrix::{General, Solve, Transpose},
    vector::Vector,
};
use serde::{de::Visitor, Deserialize, Deserializer};
use std::collections::HashMap;
use std::fmt;

#[derive(Debug, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub struct Vic3Good(i32);

impl Vic3Good {
    fn name(&self) -> &'static str {
        // Got with grep ' = {' common/goods/00_goods.txt | sed 's/\([a-z_]*\) = {/"\1",/' |  tr -d '\n'
        const GOODS: [&str; 52] = [
            "ammunition",
            "small_arms",
            "artillery",
            "tanks",
            "aeroplanes",
            "manowars",
            "ironclads",
            "grain",
            "fish",
            "fabric",
            "wood",
            "groceries",
            "clothes",
            "furniture",
            "paper",
            "services",
            "transportation",
            "electricity",
            "clippers",
            "steamers",
            "silk",
            "dye",
            "sulfur",
            "coal",
            "iron",
            "lead",
            "hardwood",
            "rubber",
            "oil",
            "engines",
            "steel",
            "glass",
            "fertilizer",
            "tools",
            "explosives",
            "porcelain",
            "meat",
            "fruit",
            "liquor",
            "wine",
            "tea",
            "coffee",
            "sugar",
            "tobacco",
            "opium",
            "automobiles",
            "telephones",
            "radios",
            "luxury_clothes",
            "luxury_furniture",
            "gold",
            "fine_art",
        ];
        GOODS.get(self.0 as usize).unwrap_or(&"unknown_good")
    }
}

impl fmt::Display for Vic3Good {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name())
    }
}

#[derive(Debug, Deserialize, PartialEq, Default)]
pub struct BuildingGoods {
    pub goods: HashMap<Vic3Good, Vic3GoodValue>,
}

type SparseRow = HashMap<usize, f64>;
impl BuildingGoods {
    fn as_sparse_row(&self, goods_index: &mut GoodsIdx) -> SparseRow {
        self.goods
            .iter()
            .map(|(good, amount)| (goods_index.get_idx(*good), amount.value()))
            .collect()
    }
}

#[derive(Debug, PartialEq)]
pub enum Vic3GoodValue {
    F64(f64),

    /// New way to represent goods starting in vic3 patch 1.9
    Object(Vic3GoodValueObject),
}

impl Vic3GoodValue {
    pub fn value(&self) -> f64 {
        match self {
            Vic3GoodValue::F64(val) => *val,
            Vic3GoodValue::Object(obj) => obj.value,
        }
    }
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Vic3GoodValueObject {
    pub value: f64,
}

struct GoodValueVisitor;

impl<'de> Visitor<'de> for GoodValueVisitor {
    type Value = Vic3GoodValue;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a float or an object with a value field")
    }

    fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(Vic3GoodValue::F64(v))
    }

    fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
    where
        A: serde::de::MapAccess<'de>,
    {
        let obj =
            Vic3GoodValueObject::deserialize(serde::de::value::MapAccessDeserializer::new(map))?;
        Ok(Vic3GoodValue::Object(obj))
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        let float_value: f64 = v.parse().map_err(serde::de::Error::custom)?;
        Ok(Vic3GoodValue::F64(float_value))
    }

    fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(Vic3GoodValue::F64(v as f64))
    }

    fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(Vic3GoodValue::F64(v as f64))
    }
}

impl<'de> Deserialize<'de> for Vic3GoodValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(GoodValueVisitor)
    }
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Vic3Building {
    pub building: String,
    pub state: u32,
    #[serde(default)]
    pub input_goods: BuildingGoods,
    #[serde(default)]
    pub output_goods: BuildingGoods,
    #[serde(default)]
    pub goods_cost: f64,
    #[serde(default)]
    pub goods_sales: f64,
    #[serde(default)]
    pub staffing: f64,
    #[serde(default)]
    pub level: i32,
}

struct GoodsIdx {
    good_to_idx: HashMap<Vic3Good, usize>,
    idx_to_good: HashMap<usize, Vic3Good>,
}
impl GoodsIdx {
    pub fn new() -> GoodsIdx {
        GoodsIdx {
            good_to_idx: HashMap::new(),
            idx_to_good: HashMap::new(),
        }
    }
    pub fn max_idx(&self) -> usize {
        self.good_to_idx.len()
    }
    pub fn good_from_idx(&self, idx: usize) -> Vic3Good {
        *self.idx_to_good.get(&idx).unwrap()
    }
    pub fn get_idx(&mut self, good: Vic3Good) -> usize {
        match self.good_to_idx.get(&good) {
            Some(idx) => *idx,
            None => {
                let new_idx = self.good_to_idx.len();
                self.good_to_idx.insert(good, new_idx);
                self.idx_to_good.insert(new_idx, good);
                new_idx
            }
        }
    }
}

fn sparse_matrix_to_matrix(sparse: Vec<SparseRow>, max_rank: usize) -> General<f64> {
    let columns = 0..max_rank;
    let non_sparse: Vec<f64> = columns
        .flat_map(|idx| {
            sparse
                .iter()
                .map(move |sparse_row| sparse_row.get(&idx).copied().unwrap_or(0.0))
        })
        .collect();
    let m = sparse.len();
    //println!("non sparse {:?} m {} rank {}", non_sparse, m, max_rank);
    General::new(m, max_rank, non_sparse)
}

#[derive(thiserror::Error, Debug, PartialEq)]
pub enum Vic3GoodEstimationError {
    #[error("The passed in buildings do not have enough variety to compute goods prices. For example you passed in 2 buildings, that use 6 goods between them.")]
    UnderdefinedGoods,

    #[error("Cannot solve equations")]
    UnsolvableEq,
}

/*
Computes goods prices by performing linear regression on inputs/output goods
of the passed in buildings.

The goods prices aren't directly stored in the save, so it's difficult to get them.
One option could be to sum up all the buy/sell orders in the market
to get the balance and then compute it off the base price. This is hard to do
as it needs to take into account pops/buildings/trade routes, it's basically
running half the game.

Luckily the save stores the amount of input/output goods a building is using
and their cost. This gives us a system of linear equations that we can solve
to get goods prices.

Due to local markets and other varience, the equations aren't precise, so we need
to do linear regression instead. This gives us a good enough estimate
*/
pub fn goods_price_based_on_buildings<'a, T>(
    buildings: T,
) -> Result<HashMap<Vic3Good, f64>, Vic3GoodEstimationError>
where
    T: Iterator<Item = &'a Vic3Building>,
{
    let mut goods_index = GoodsIdx::new();
    let mut sparse_goods_matrix: Vec<SparseRow> = vec![];
    let mut cost_vec: Vec<f64> = vec![];
    for building in buildings {
        if building.goods_cost > 1.0 {
            cost_vec.push(building.goods_cost);
            sparse_goods_matrix.push(building.input_goods.as_sparse_row(&mut goods_index));
        }
        if building.goods_sales > 1.0 {
            cost_vec.push(building.goods_sales);
            sparse_goods_matrix.push(building.output_goods.as_sparse_row(&mut goods_index));
        }
    }
    let goods_matrix = sparse_matrix_to_matrix(sparse_goods_matrix, goods_index.max_idx());
    let (m, n) = goods_matrix.dim();
    if m < n {
        return Err(Vic3GoodEstimationError::UnderdefinedGoods);
    }

    // Solve A*x = y, where A is the ammount coefficients matrix,
    // x is the unknown thar will be goods prices and y is goods cost
    let a = goods_matrix.clone().transpose() * goods_matrix.clone();
    let y = goods_matrix.transpose() * Vector::new_column(cost_vec);

    let x = a
        .solve(&y)
        .map_err(|_| Vic3GoodEstimationError::UnsolvableEq)?;
    Ok(x.iter()
        .enumerate()
        .map(|(pos, val)| (goods_index.good_from_idx(pos), *val))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_building(goods: HashMap<Vic3Good, f64>, goods_cost: f64) -> Vic3Building {
        Vic3Building {
            building: String::from("test_building"),
            state: 1,
            staffing: 1.0,
            level: 1,
            input_goods: BuildingGoods {
                goods: goods
                    .into_iter()
                    .map(|(k, v)| (k, Vic3GoodValue::F64(v)))
                    .collect(),
            },
            goods_cost,
            goods_sales: 0.0,
            output_goods: BuildingGoods {
                goods: HashMap::default(),
            },
        }
    }

    #[test]
    fn simple_2_by_2_system() {
        // 1 costs 20, 2 costs 40
        let buildings = [
            test_building(
                HashMap::from([(Vic3Good(1), 1.0), (Vic3Good(2), 2.0)]),
                100.0,
            ),
            test_building(
                HashMap::from([(Vic3Good(1), 1.0), (Vic3Good(2), 3.0)]),
                140.0,
            ),
        ];
        let goods_prices = goods_price_based_on_buildings(buildings.iter()).unwrap();
        assert_eq!(
            goods_prices.get(&Vic3Good(1)).copied().unwrap().round() as i32,
            20
        );
        assert_eq!(
            goods_prices.get(&Vic3Good(2)).copied().unwrap().round() as i32,
            40
        );
    }

    #[test]
    fn simple_overdefined_1_by_1_system() {
        // 1 costs bout 20
        let buildings = [
            test_building(HashMap::from([(Vic3Good(1), 1.0)]), 19.75),
            test_building(HashMap::from([(Vic3Good(1), 6.0)]), 120.2),
        ];
        let goods_prices = goods_price_based_on_buildings(buildings.iter()).unwrap();
        assert_eq!(
            goods_prices.get(&Vic3Good(1)).copied().unwrap().round() as i32,
            20
        );
    }

    #[test]
    fn underdefined_system() {
        // 1 costs bout 20
        let buildings = [test_building(
            HashMap::from([(Vic3Good(1), 1.0), (Vic3Good(2), 1.0), (Vic3Good(3), 1.0)]),
            19.75,
        )];
        let goods_prices = goods_price_based_on_buildings(buildings.iter());
        assert_eq!(
            goods_prices,
            Err(Vic3GoodEstimationError::UnderdefinedGoods),
        );
    }
}
