use napi::{Error, JsString, Task};

pub struct FileParser {
    pub path: String,
}

impl FileParser {
    pub fn parse_file(&self) -> Result<String, Box<dyn std::error::Error>> {
        let f = admin_shared::parser::parse_path(&self.path)?;
        let result = serde_json::to_string(&f)?;
        Ok(result)
    }
}

impl Task for FileParser {
    type Output = String;
    type JsValue = JsString;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        self.parse_file()
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        env.create_string_from_std(output)
    }
}
