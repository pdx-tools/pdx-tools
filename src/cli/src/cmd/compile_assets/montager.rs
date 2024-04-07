use std::{
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::bail;

pub enum WebpQuality {
    #[allow(dead_code)]
    Lossless,
    Quality(i32),
}

pub enum Encoding {
    Webp(WebpQuality),
}

pub struct Montager {
    pub name: &'static str,
    pub base_path: PathBuf,
    pub encoding: Encoding,
    pub args: &'static [&'static str],
}

impl Montager {
    pub fn montage<KEY, PATH>(&self, data: &[(KEY, PATH)]) -> anyhow::Result<()>
    where
        KEY: AsRef<str>,
        PATH: AsRef<Path>,
    {
        let json_path = self.base_path.join(format!("{}.json", self.name));
        let data_file = std::fs::File::create(json_path)?;
        let mut json = BufWriter::new(data_file);

        let cols = (data.len() as f64).sqrt().ceil();
        let mut cmd = Command::new("montage");
        cmd.args(self.args)
            .arg("-mode")
            .arg("concatenate")
            .arg("-tile")
            .arg(&format!("{cols}x"));

        match self.encoding {
            Encoding::Webp(WebpQuality::Lossless) => {
                cmd.arg("-define").arg("webp:lossless=true");
            }
            Encoding::Webp(WebpQuality::Quality(q)) => {
                cmd.arg("-quality").arg(format!("{}", q));
            }
        };
        json.write_all(&b"{\n"[..])?;

        for (i, (key, path)) in data.iter().enumerate() {
            if i != 0 {
                json.write_all(&b","[..])?;
            }

            write!(json, "\"{}\":{}", key.as_ref(), i)?;
            cmd.arg(path.as_ref());
        }

        json.write_all(&b"\n}"[..])?;
        json.flush()?;

        let img_path = self.base_path.join(format!("{}.webp", self.name));
        cmd.arg(img_path);
        let child = cmd.output()?;

        if !child.status.success() {
            bail!(
                "{} convert failed with: {}",
                self.name,
                String::from_utf8_lossy(&child.stderr)
            );
        }

        Ok(())
    }
}
