#version 300 es

#define CORNER_A
#define XBR_SCALE 4.0
#define XBR_Y_WEIGHT 48.0
#define XBR_EQ_THRESHOLD 25.0
#define XBR_LV2_COEFFICIENT 2.0

precision mediump float;

uniform sampler2D u_mapEdgesTexture1;
uniform sampler2D u_mapEdgesTexture2;
uniform sampler2D u_mapTexture1;
uniform sampler2D u_mapTexture2;
uniform sampler2D u_normalImage;
uniform sampler2D u_waterImage;
uniform sampler2D u_colormapImage;
uniform sampler2D u_surfaceRockImage;
uniform sampler2D u_surfaceGreenImage;
uniform sampler2D u_surfaceNormalRockImage;
uniform sampler2D u_surfaceNormalGreenImage;
uniform sampler2D u_heightMapImage;
uniform sampler2D u_seaImage;
uniform vec2 u_textureSize;
uniform vec2 u_usedTextureSize;
uniform float u_scale;
uniform float u_maxScale;
uniform bool u_renderTerrain;

in highp vec4 v_t1;
in highp vec4 v_t2;
in highp vec4 v_t3;
in highp vec4 v_t4;
in highp vec4 v_t5;
in highp vec4 v_t6;
in highp vec4 v_t7;
in highp vec2 v_texCoord;

out vec4 outColor;

const vec4 Ao = vec4( 1.0, -1.0, -1.0, 1.0 );
const vec4 Bo = vec4( 1.0,  1.0, -1.0,-1.0 );
const vec4 Co = vec4( 1.5,  0.5, -0.5, 0.5 );
const vec4 Ax = vec4( 1.0, -1.0, -1.0, 1.0 );
const vec4 Bx = vec4( 0.5,  2.0, -0.5,-2.0 );
const vec4 Cx = vec4( 1.0,  1.0, -0.5, 0.0 );
const vec4 Ay = vec4( 1.0, -1.0, -1.0, 1.0 );
const vec4 By = vec4( 2.0,  0.5, -2.0,-0.5 );
const vec4 Cy = vec4( 2.0,  0.0, -1.0, 0.5 );
const vec4 Ci = vec4(0.25, 0.25, 0.25, 0.25);
const vec3 Y = vec3(0.2126, 0.7152, 0.0722);

const vec3 viewDirection = vec3(0.0, 0.0, 1.0);

vec4 df(vec4 A, vec4 B)
{
	return vec4(abs(A-B));
}

float c_df(vec3 c1, vec3 c2) 
{
        vec3 df = abs(c1 - c2);
        return df.r + df.g + df.b;
}

bvec4 eq(vec4 A, vec4 B)
{
	return lessThan(df(A, B), vec4(XBR_EQ_THRESHOLD));
}

vec4 weighted_distance(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h)
{
	return (df(a,b) + df(a,c) + df(d,e) + df(d,f) + 4.0*df(g,h));
}


float frac(highp float v)
{
  return v - floor(v);
}

vec4 saturate(vec4 x)
{
  return max(vec4(0.0), min(vec4(1.0), x));
}

bvec4 and(bvec4 x, bvec4 y)
{
  return bvec4(vec4(x) * vec4(y));
}

bvec4 or(bvec4 x, bvec4 y)
{
  return bvec4(vec4(x) + vec4(y));
}

vec3 lerp(vec3 a, vec3 b, float w)
{
  return a + w*(b-a);
}

vec3 lerp(vec3 a, vec3 b, bool w)
{
  return a + float(w)*(b-a);
}

bool isLowerMountain(vec3 color) {
	bool b = all(greaterThan(color, vec3(0.43,0.285, 0.12))) && all(lessThan(color, vec3(0.44, 0.30, 0.125)));
	return b;
}

bool isHigherMountain(vec3 color) {
	bool b = all(greaterThan(color, vec3(0.25,0.16, 0.06))) && all(lessThan(color, vec3(0.26, 0.17, 0.07)));
	return b;
}

vec4 rawMapAt(highp vec2 tc) {
	if (tc.x <= 0.5) {
		return texture(u_mapTexture1, vec2(tc.x * 2.0, tc.y));
	} else {
		return texture(u_mapTexture2, vec2((tc.x - 0.5) * 2.0, tc.y));
	}
}

vec3 postProcess(highp vec2 tc) {
	vec4 map = rawMapAt(tc);

	if (!u_renderTerrain) {
		// Sea
		if (abs(map.a - 0.20) < 0.0001) {
			return vec3(68.0, 107.0, 163.0) / vec3(256.0, 256.0, 256.0);
		}
		if (abs(map.a - 0.4) < 0.0001) {
			return vec3(0.3, 0.3, 0.3);
		}
		return map.rgb;
	}

	vec3 colormap = texture(u_colormapImage, tc * vec2(u_textureSize.x / u_usedTextureSize.x, 1.0)).rgb;
	vec3 normal = normalize(texture(u_normalImage, tc * vec2(u_textureSize.x / u_usedTextureSize.x, 1.0)).xyz);
	float normal_map_res = dot(viewDirection, normal);

	// Sea
	if (abs(map.a - 0.20) < 0.0001) {
		vec2 seaTc = mod(tc * u_textureSize * 6.0, 256.0) / 256.0;
		vec3 sea_overlay_color = texture(u_waterImage, seaTc).rgb;
		vec3 sea_background_color = texture(u_seaImage, tc * vec2(u_textureSize.x / u_usedTextureSize.x, 1.0)).rgb * pow(normal_map_res, 4.0) * 1.2;
		float water_weight = min(1.0, max(0.0, (u_scale - (u_maxScale / 3.0)) / u_maxScale * 2.0));
		return vec3(water_weight * 0.3 * sea_overlay_color + (1.6 - water_weight) * sea_background_color);
	}

	// River in terrain
	if (map.a == 0.6) {
		vec2 pixel_coord = tc * u_textureSize * 40.0;
		vec2 seaTc = mod(pixel_coord, 256.0) / 256.0;
		vec4 sea_overlay_color = texture(u_waterImage, seaTc);
		float water_weight = 0.3;
		return (water_weight * sea_overlay_color.rgb) + (0.6 - water_weight) * colormap.rgb;
	}

	float alphaZoomMult = 0.3 * (u_scale / u_maxScale);
	float effectiveMapAlpha = map.a == 0.4 ? 0.0 : (1.0 - alphaZoomMult) * map.a;
	bool needsToRenderTerrain = map.a == 0.4 || effectiveMapAlpha < 1.0;
	vec3 outColor = vec3(0.0);
	
	// Mountains
	if (needsToRenderTerrain) {
		vec2 pixel_coord = tc * u_textureSize * 2.0;
		vec2 seaTc = mod(pixel_coord, 64.0) / 64.0;
		float hm = pow(max(min(texture(u_heightMapImage, tc * vec2(u_textureSize.x / u_usedTextureSize.x, 1.0)).r, 0.6), 0.3), 5.0) * 5.5;
		float alpha = (0.65 * hm * u_scale / u_maxScale);
		vec3 resColor = (1.0- alpha) * colormap.rgb + alpha * texture(u_surfaceRockImage, seaTc).rgb;

		vec3 rock_normal = normalize(texture(u_surfaceNormalRockImage, seaTc).rgb);
		float resNormal = (1.0- alpha) * dot(viewDirection, normal) + alpha * dot(viewDirection, rock_normal);

		if (alpha > 0.05) {
			outColor = vec3(resColor * pow(resNormal, 8.0) * 4.0);
			needsToRenderTerrain = false;
		}
	}

	bool desert = colormap.r > colormap.g;

	// Desert
	if (needsToRenderTerrain && desert) {
		vec2 pixel_coord = tc * u_textureSize * 0.5;
		vec2 seaTc = mod(pixel_coord, 64.0) / 64.0;
		vec3 green_normal = normalize(texture(u_surfaceNormalGreenImage, seaTc).rgb);
		float alpha = 0.075 * u_scale / u_maxScale;
		vec3 resColor = (1.0- alpha) * colormap.rgb + alpha * texture(u_surfaceGreenImage, seaTc).rgb;
		float resNormal = (1.0- alpha) * normal_map_res + alpha * dot(viewDirection, green_normal);
		outColor = vec3(resColor * pow(resNormal, 8.0) * 4.0);
	}

	// Grasslands
	if (needsToRenderTerrain && !desert) {
		vec2 pixel_coord = tc * u_textureSize * 3.0;
		vec2 seaTc = mod(pixel_coord, 64.0) / 64.0;
		vec3 color = texture(u_surfaceRockImage, seaTc).rgb;
		vec3 green_normal = normal = normalize(texture(u_surfaceNormalRockImage, seaTc).rgb);
		float hm = pow(max(min(texture(u_heightMapImage, tc * vec2(u_textureSize.x / u_usedTextureSize.x, 1.0)).r, 0.6), 0.3), 5.0) * 5.5;
		float alpha = 0.095 * (1.0 - hm) * u_scale / u_maxScale;
		vec3 resColor = (1.0- alpha) * colormap.rgb + alpha * texture(u_surfaceGreenImage, seaTc).rgb;
		float resNormal = (1.0- alpha) * normal_map_res + alpha * dot(viewDirection, green_normal);
		outColor = vec3(resColor * pow(resNormal, 8.0) * 4.0);
	}

	vec3 mapColor = vec3(map.rgb * pow(normal_map_res, 5.0) * 2.2);
	// Use ^0.35 to prevent darkening as the terrain color is usually darker
	vec3 res = pow(effectiveMapAlpha, 0.35) * mapColor + (1.0 - effectiveMapAlpha) * outColor;

	return res;
}

vec3 image(highp vec2 tc) {
	return postProcess(tc);
}

vec3 edgeDetectionImage(highp vec2 tc) {
	if (tc.x <= 0.5) {
		return texture(u_mapEdgesTexture1, vec2(tc.x * 2.0, tc.y)).rgb;
	} else {
		return texture(u_mapEdgesTexture2, vec2((tc.x - 0.5) * 2.0, tc.y)).rgb;
	}
}

void main() {
	// outColor = vec4(edgeDetectionImage(v_texCoord), 1.0);
	// outColor = rawMapAt(v_texCoord);
	// outColor = vec4(postProcess(v_texCoord), 1.0);
	// return;

    bvec4 edri, edr, edr_left, edr_up, px; // px = pixel, edr = edge detection rule
	bvec4 interp_restriction_lv0, interp_restriction_lv1, interp_restriction_lv2_left, interp_restriction_lv2_up;
	vec4 fx, fx_left, fx_up; // inequations of straight lines.

	vec4 delta         = vec4(1.0/XBR_SCALE, 1.0/XBR_SCALE, 1.0/XBR_SCALE, 1.0/XBR_SCALE);
	vec4 deltaL        = vec4(0.5/XBR_SCALE, 1.0/XBR_SCALE, 0.5/XBR_SCALE, 1.0/XBR_SCALE);
	vec4 deltaU        = deltaL.yxwz;

	vec2 fp = vec2(frac(v_texCoord.x * u_textureSize.x), frac(v_texCoord.y * u_textureSize.y));

	//    A1 B1 C1
	// A0  A  B  C C4
	// D0  D  E  F F4
	// G0  G  H  I I4
	//    G5 H5 I5  
	vec3 A1 = edgeDetectionImage(v_t1.xw);
	vec3 B1 = edgeDetectionImage(v_t1.yw);
	vec3 C1 = edgeDetectionImage(v_t1.zw);
	vec3 A  = edgeDetectionImage(v_t2.xw);
	vec3 B  = edgeDetectionImage(v_t2.yw);
	vec3 C  = edgeDetectionImage(v_t2.zw);
	vec3 D  = edgeDetectionImage(v_t3.xw);
	vec3 E  = edgeDetectionImage(v_t3.yw);
	vec3 F  = edgeDetectionImage(v_t3.zw);
	vec3 G  = edgeDetectionImage(v_t4.xw);
	vec3 H  = edgeDetectionImage(v_t4.yw);
	vec3 I  = edgeDetectionImage(v_t4.zw);
	vec3 G5 = edgeDetectionImage(v_t5.xw);
	vec3 H5 = edgeDetectionImage(v_t5.yw);
	vec3 I5 = edgeDetectionImage(v_t5.zw);
	vec3 A0 = edgeDetectionImage(v_t6.xy);
	vec3 D0 = edgeDetectionImage(v_t6.xz);
	vec3 G0 = edgeDetectionImage(v_t6.xw);
	vec3 C4 = edgeDetectionImage(v_t7.xy);
	vec3 F4 = edgeDetectionImage(v_t7.xz);
	vec3 I4 = edgeDetectionImage(v_t7.xw);

	vec4 b = transpose(mat4x3(B, D, H, F)) * (XBR_Y_WEIGHT*Y);
	vec4 c = transpose(mat4x3(C, A, G, I)) * (XBR_Y_WEIGHT*Y);
	vec4 e = transpose(mat4x3(E, E, E, E)) * (XBR_Y_WEIGHT*Y);
	vec4 d = b.yzwx;
	vec4 f = b.wxyz;
	vec4 g = c.zwxy;
	vec4 h = b.zwxy;
	vec4 i = c.wxyz;

	vec4 i4 = transpose(mat4x3(I4, C1, A0, G5)) * (XBR_Y_WEIGHT*Y );
	vec4 i5 = transpose(mat4x3(I5, C4, A1, G0)) * (XBR_Y_WEIGHT*Y );
	vec4 h5 = transpose(mat4x3(H5, F4, B1, D0)) * (XBR_Y_WEIGHT*Y );
	vec4 f4 = h5.yzwx;


	// These inequations define the line below which interpolation occurs.
	fx      = (Ao*fp.y+Bo*fp.x); 
	fx_left = (Ax*fp.y+Bx*fp.x);
	fx_up   = (Ay*fp.y+By*fp.x);

    interp_restriction_lv1 = interp_restriction_lv0 = and(notEqual(e, f), notEqual(e, h));





	interp_restriction_lv2_left = and(notEqual(e, g), notEqual(d,g));
	interp_restriction_lv2_up   = and(notEqual(e,c), notEqual(b,c));

	vec4 fx45i = saturate((fx      + delta  -Co - Ci)/(2.0 * delta ));
	vec4 fx45  = saturate((fx      + delta  -Co     )/(2.0*delta ));
	vec4 fx30  = saturate((fx_left + deltaL -Cx     )/(2.0*deltaL));
	vec4 fx60  = saturate((fx_up   + deltaU -Cy     )/(2.0*deltaU));

	vec4 wd1 = weighted_distance( e, c, g, i, h5, f4, h, f);
	vec4 wd2 = weighted_distance( h, d, i5, f, i4, b, e, i);

	edri     = and(lessThanEqual(wd1, wd2), interp_restriction_lv0);
	edr      = and(lessThan(wd1, wd2), interp_restriction_lv1);

#ifdef CORNER_A
	edr      = and(edr, or(not(edri.yzwx), not(edri.wxyz)));
	edr_left = and(and(and(lessThanEqual((XBR_LV2_COEFFICIENT*df(f,g)), df(h,c)), interp_restriction_lv2_left), edr), (and(not(edri.yzwx), eq(e,c))));
	edr_up   = and(and(and(greaterThanEqual(df(f,g), (XBR_LV2_COEFFICIENT*df(h,c))), interp_restriction_lv2_up), edr), (and(not(edri.wxyz), eq(e,g))));
#endif

	fx45  = vec4(edr)*fx45;
	fx30  = vec4(edr_left)*fx30;
	fx60  = vec4(edr_up)*fx60;
	fx45i = vec4(edri)*fx45i;

	px = lessThanEqual(df(e,f), df(e,h));

	vec4 maximos = max(max(fx30, fx60), max(fx45, fx45i));




     // Now that edges are detected, use actual layered image values to determine colors
	 A  = image(v_t2.xw);
	 B  = image(v_t2.yw);
	 C  = image(v_t2.zw);

	 D  = image(v_t3.xw);
	 E  = image(v_t3.yw);
	 F  = image(v_t3.zw);

	 G  = image(v_t4.xw);
	 H  = image(v_t4.yw);
	 I  = image(v_t4.zw);

	vec3 res1 = E;
	res1 = lerp(res1, lerp(H, F, px.x), maximos.x);
	res1 = lerp(res1, lerp(B, D, px.z), maximos.z);
	
	vec3 res2 = E;
	res2 = lerp(res2, lerp(F, B, px.y), maximos.y);
	res2 = lerp(res2, lerp(D, H, px.w), maximos.w);
	
	vec3 res = lerp(res1, res2, step(c_df(E, res1), c_df(E, res2)));
	outColor = vec4(res + vec3(0.1), 1);
}