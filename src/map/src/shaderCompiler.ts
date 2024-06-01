import { notNull } from "./nullcheck";
import { ShaderSource } from "./types";

export function compileShaders(
  gl: WebGL2RenderingContext,
  sources: ShaderSource[],
) {
  const programs = createPrograms(gl, sources);
  return {
    linked: () => {
      for (const { program, vertexShader, fragmentShader } of programs) {
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          const error = [
            `Link failed: ${gl.getProgramInfoLog(program)}`,
            `vs info: ${gl.getShaderInfoLog(vertexShader)}`,
            `fs info: ${gl.getShaderInfoLog(fragmentShader)}`,
          ].join("\n");

          throw new Error(error);
        }
      }

      return programs.map((x) => x.program);
    },
  };
}

// Compile and link programs in parallel
// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#compile_shaders_and_link_programs_in_parallel
function createPrograms(gl: WebGL2RenderingContext, sources: ShaderSource[]) {
  return sources.map(({ vertex, fragment }) => {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertex);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragment);
    return {
      program: createProgram(gl, vertexShader, fragmentShader),
      vertexShader,
      fragmentShader,
    };
  });
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = notNull(gl.createShader(type));
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
) {
  const program = notNull(gl.createProgram());
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  return program;
}
