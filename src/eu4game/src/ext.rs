use eu4save::{models::Province, Eu4Date};

pub trait ProvinceExt {
    fn recently_exploited(&self, at: Eu4Date) -> bool;
    fn exploitable(&self, at: Eu4Date) -> bool;
}

impl ProvinceExt for Province {
    fn recently_exploited(&self, at: Eu4Date) -> bool {
        self.exploit_date
            .map_or(false, |x| x.add_days(365 * 20) > at)
    }

    fn exploitable(&self, at: Eu4Date) -> bool {
        // Can't exploit production of inland provinces, but this hasn't been setup,
        // so just rely on either tax or manpower being above 2.
        let has_dev = self.base_tax >= 2.0 || self.base_manpower >= 2.0;
        has_dev && !self.recently_exploited(at)
    }
}
