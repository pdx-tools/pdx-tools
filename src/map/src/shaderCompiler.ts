import { ShaderSource } from "./types";

// Compile shaders and link programs in parallel
// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#compile_shaders_and_link_programs_in_parallel
export function compile(
  gl: WebGL2RenderingContext,
  sources: ShaderSource[]
): () => Promise<WebGLProgram[]> {
  const ext = gl.getExtension("KHR_parallel_shader_compile");
  const shaders = sources.map(({ vertex, fragment }) => [
    createShader(gl, gl.VERTEX_SHADER, vertex),
    createShader(gl, gl.FRAGMENT_SHADER, fragment),
  ]);

  const programs = shaders.map(([vertex, fragment]) =>
    createProgram(gl, vertex, fragment)
  );

  // Prefer COMPLETION_STATUS_KHR if available
  // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#prefer_khr_parallel_shader_compile
  const resolveStatus = (
    program: WebGLProgram,
    resolve: (value: boolean) => void
  ) => {
    if (ext && gl.getProgramParameter(program, ext.COMPLETION_STATUS_KHR)) {
      resolve(gl.getProgramParameter(program, gl.LINK_STATUS));
    } else {
      setTimeout(() => resolveStatus(program, resolve), 10);
    }
  };

  const programStatus: (program: WebGLProgram) => Promise<boolean> = ext
    ? (program) => {
        return new Promise((resolve) => resolveStatus(program, resolve));
      }
    : (program) => gl.getProgramParameter(program, gl.LINK_STATUS);

  // Only check status of everything at the end of pipeline
  // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#dont_check_shader_compile_status_unless_linking_fails
  return async () => {
    for (let i = 0; i < programs.length; i++) {
      const program = programs[i];
      const [vertexShader, fragmentShader] = shaders[i];

      const isSuccess = await programStatus(program);

      if (!isSuccess) {
        throw new Error(
          `Link failed: ${gl.getProgramInfoLog(
            program
          )} | vs info: ${gl.getShaderInfoLog(
            vertexShader
          )} | fs info: ${gl.getShaderInfoLog(fragmentShader)}`
        );
      }
    }

    return programs;
  };
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
) {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error("null shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
) {
  const program = gl.createProgram();
  if (program === null) {
    throw new Error("null program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  return program;
}
