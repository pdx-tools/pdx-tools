use napi::{Error, JsString, Task};

pub struct FileHasher {
    pub path: String,
}

impl FileHasher {
    fn hash(&self) -> Result<String, Box<dyn std::error::Error>> {
        Ok(applib::hasher::hash(&self.path)?)
    }
}

impl Task for FileHasher {
    type Output = String;
    type JsValue = JsString;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        self.hash().map_err(|e| Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        env.create_string_from_std(output)
    }
}
