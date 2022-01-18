#version 300 es

precision mediump float;

in vec2 a_position;
in vec2 a_texCoord;

uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform vec2 u_focusPoint;
uniform float u_scale;
uniform bool u_flipY;

out vec2 v_texCoord;
out vec4 v_t1;
out vec4 v_t2;
out vec4 v_t3;
out vec4 v_t4;
out vec4 v_t5;
out vec4 v_t6;
out vec4 v_t7;

void main() {
	vec2 scaledPosition = (a_position - u_focusPoint) * u_scale;
	vec2 position = scaledPosition + (u_resolution / 2.0);
	vec2 zeroToOne = position / u_resolution;
	vec2 zeroToTwo = zeroToOne * 2.0;
	vec2 clipSpace = zeroToTwo - 1.0;
	gl_Position = vec4(clipSpace * vec2(1, u_flipY ? 1 : -1), 0, 1);

	vec2 ps = vec2(1.0 / u_textureSize.x, 1.0 / u_textureSize.y);
	float dx = ps.x;
	float dy = ps.y;

	//    A1 B1 C1
	// A0  A  B  C C4
	// D0  D  E  F F4
	// G0  G  H  I I4
	//    G5 H5 I5  

  v_texCoord = a_texCoord;
    v_t1 = a_texCoord.xxxy + vec4( -dx, 0, dx,-2.0*dy); // A1 B1 C1
	v_t2 = a_texCoord.xxxy + vec4( -dx, 0, dx,    -dy); //  A  B  C
	v_t3 = a_texCoord.xxxy + vec4( -dx, 0, dx,      0); //  D  E  F
	v_t4 = a_texCoord.xxxy + vec4( -dx, 0, dx,     dy); //  G  H  I
    v_t5 = a_texCoord.xxxy + vec4( -dx, 0, dx, 2.0*dy); // G5 H5 I5
	v_t6 = a_texCoord.xyyy + vec4(-2.0*dx,-dy, 0,  dy); // A0 D0 G0
	v_t7 = a_texCoord.xyyy + vec4( 2.0*dx,-dy, 0,  dy); // C4 F4 I4

}