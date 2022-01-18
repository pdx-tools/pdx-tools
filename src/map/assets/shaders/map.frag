#version 300 es

precision mediump float;

uniform sampler2D u_terrainImage;
uniform sampler2D u_riversImage;
uniform sampler2D u_provincesImage;
uniform sampler2D u_stripesImage;
uniform sampler2D u_provincesUniqueColorsImage;
uniform sampler2D u_countryProvincesColorImage;
uniform sampler2D u_primaryProvincesColorImage;
uniform sampler2D u_secondaryProvincesColorImage;
uniform bool u_renderProvinceBorders;
uniform bool u_renderMapmodeBorders;
uniform bool u_renderCountryBorders;
uniform uint u_provinceCount;
uniform vec2 u_textureSize;

in vec2 v_texCoord;

layout(location = 0) out vec4 outEdgesColor;
layout(location = 1) out vec4 outColor;

const vec3 viewDirection = vec3(0.0, 0.0, 1.0);

// Use terrain image to determine sea terrain by checking against fixed sea terrain colors.
bool isSeaAt(vec2 tc)
{
  vec3 terrain_color = texture(u_terrainImage, tc).rgb;
  bool isDeepSea = all(greaterThan(terrain_color, vec3(0.03,0.12, 0.5))) && all(lessThan(terrain_color, vec3(0.04, 0.122, 0.52)));
  if (isDeepSea)
  {
    return true;
  }
  
  bool isInlandSea = all(greaterThan(terrain_color, vec3(0.21,0.35, 0.86))) && all(lessThan(terrain_color, vec3(0.218, 0.355, 0.865)));
  if (isInlandSea)
  {
    return true;
  }

  return false;
}

bool isCoastAt(vec2 tc)
{
  vec3 terrain_color = texture(u_terrainImage, tc).rgb;
  bool isCoast = terrain_color.r == 1.0 && terrain_color.b == 0.0 && terrain_color.g > 0.965 && terrain_color.g < 0.971;
  return isCoast;
}

bool isRiverAt(vec2 tc)
{
	vec3 rivers_map_color = texture(u_riversImage, tc).rgb;
	return any(greaterThan(rivers_map_color, vec3(0.7))) && any(lessThan(rivers_map_color, vec3(0.9)));
}

float ordering(vec3 c1, vec3 c2) {
	vec3 result = sign(c1 - c2);
	return dot(result, vec3(4.0, 2.0, 1.0));
}

bool borderCompare(vec3 here, vec2 hereTc, vec2 d) {
	if (isSeaAt(hereTc) && !isSeaAt(hereTc + d)) {
		return false;
	}

	if(!isSeaAt(hereTc) && isSeaAt(hereTc + d)) {
		return true;
	}

	vec3 other = texture(u_provincesImage, hereTc + d).rgb;
	return ordering(here, other) > 0.0;
}


// Get index of color in the ordered color array u_orderedColors
uint getOrderedProvinceColorIndex(vec3 color)
{
	// Do binary search on u_orderedColors with float indices, since the ordered color data is saved in a texture
	uint l = 0u;
	uint r = u_provinceCount;
	while (l <= r)
	{
		uint m = (l + r) / 2u;
		vec3 colorAtIndex = texelFetch(u_provincesUniqueColorsImage, ivec2(int(m), 0), 0).rgb;
		float order = ordering(color, colorAtIndex);
		if (order > 0.0)
		{
			l = m + 1u;
			continue;
		}
		
		if (order < 0.0)
		{
			r = m - 1u;
			continue;
		}
		return m;
	}
	return 0u;
}

bool renderBorderAt(vec2 tc, vec2 ps)
{
	if (!u_renderProvinceBorders) {
		return false;
	}

	vec3 provincesImgHere = texture(u_provincesImage, tc).rgb;
	if (borderCompare(provincesImgHere, tc, vec2(0, ps.y)))
	{
		return true;
	}
	if (borderCompare(provincesImgHere, tc, vec2(0, -ps.y)))
	{
		return true;
	}
	if (borderCompare(provincesImgHere, tc, vec2(ps.x, 0.0)))
	{
		return true;
	}
	if (borderCompare(provincesImgHere, tc, vec2(-ps.x, 0.0)))
	{
		return true;
	}

	return false;
}

bool mapmodeBorderCompare(vec3 here, vec2 hereTc, vec2 d) {
	uint otherProvinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, hereTc + d).rgb);
	vec3 otherPrimaryColor = texelFetch(u_primaryProvincesColorImage, ivec2(otherProvinceIndex, 0), 0).rgb;

	if (here != otherPrimaryColor) {
		return true;
	}
	return false;
}

bool countryBorderCompare(vec3 here, vec2 hereTc, vec2 d) {
	uint otherProvinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, hereTc + d).rgb);
	vec3 otherPrimaryColor = texelFetch(u_countryProvincesColorImage, ivec2(otherProvinceIndex, 0), 0).rgb;

	if (here != otherPrimaryColor) {
		return true;
	}
	return false;
}

bool renderMapmodeBorderAt(vec2 tc, vec2 ps)
{
	if (!u_renderMapmodeBorders) {
		return false;
	}

	uint provinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, tc).rgb);
	vec3 primaryColor = texelFetch(u_primaryProvincesColorImage, ivec2(provinceIndex, 0), 0).rgb;
	if (mapmodeBorderCompare(primaryColor, tc, vec2(0, ps.y)))
	{
		return true;
	}
	if (mapmodeBorderCompare(primaryColor, tc, vec2(0, -ps.y)))
	{
		return true;
	}
	if (mapmodeBorderCompare(primaryColor, tc, vec2(ps.x, 0.0)))
	{
		return true;
	}
	if (mapmodeBorderCompare(primaryColor, tc, vec2(-ps.x, 0.0)))
	{
		return true;
	}

	return false;
}

bool renderCountryBorderAt(vec2 tc, vec2 ps)
{
	if (!u_renderCountryBorders) {
		return false;
	}

	uint provinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, tc).rgb);
	vec3 primaryColor = texelFetch(u_countryProvincesColorImage, ivec2(provinceIndex, 0), 0).rgb;
	if (countryBorderCompare(primaryColor, tc, vec2(0, ps.y)))
	{
		return true;
	}
	if (countryBorderCompare(primaryColor, tc, vec2(0, -ps.y)))
	{
		return true;
	}
	if (countryBorderCompare(primaryColor, tc, vec2(ps.x, 0.0)))
	{
		return true;
	}
	if (countryBorderCompare(primaryColor, tc, vec2(-ps.x, 0.0)))
	{
		return true;
	}

	return false;
}

bool renderSecondaryColorAt(vec2 tc) {
	vec2 size = vec2(textureSize(u_provincesImage, 0));
	vec2 pixel_coord = tc * size * 5.0;
	vec2 stripes_tc = mod(pixel_coord, 128.0)  / 128.0;
	stripes_tc.x = -stripes_tc.x;
	vec4 stripes_color = texture(u_stripesImage, stripes_tc);
	return stripes_color.a > 0.0;
}

vec3 edgeDetectionImage(vec2 tc, vec2 ps) {
	if (isSeaAt(tc)) {
		return vec3(0.5);
	}

	if (renderCountryBorderAt(tc, ps)) {
		uint provinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, tc).rgb);
		vec4 primaryColor = texelFetch(u_countryProvincesColorImage, ivec2(provinceIndex, 0), 0);
		return primaryColor.rgb - vec3(0.2, 0.2, 0.2);
	}

	if (renderMapmodeBorderAt(tc, ps)) {
		uint provinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, tc).rgb);
		vec4 primaryColor = texelFetch(u_primaryProvincesColorImage, ivec2(provinceIndex, 0), 0);
		return primaryColor.rgb - vec3(0.2, 0.2, 0.2);
	}

	if (renderBorderAt(tc, ps)) {
		return vec3(0.1);
	}

	uint provinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, tc).rgb);
	vec4 primaryColor = texelFetch(u_primaryProvincesColorImage, ivec2(provinceIndex, 0), 0);
	vec4 secondaryColor = texelFetch(u_secondaryProvincesColorImage, ivec2(provinceIndex, 0), 0);
	if (primaryColor != secondaryColor) {
		if (renderSecondaryColorAt(tc)) {
			return vec3(0.5);
		}
	}

	vec3 res = primaryColor.rgb;
	bool river = isRiverAt(tc);
	if (river) {
		//return vec3(1.0);
	}

	return res;
}

vec4 displayImage(vec2 tc, vec2 ps) {
	if (isSeaAt(tc)) {
		return vec4(0.0, 0.0, 1.0, 0.2);
	}

	if (renderCountryBorderAt(tc, ps)) {
		uint provinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, tc).rgb);
		vec4 primaryColor = texelFetch(u_countryProvincesColorImage, ivec2(provinceIndex, 0), 0);
		return primaryColor - vec4(0.2, 0.2, 0.2, 0.0);
	}

	if (renderMapmodeBorderAt(tc, ps)) {
		uint provinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, tc).rgb);
		vec4 primaryColor = texelFetch(u_primaryProvincesColorImage, ivec2(provinceIndex, 0), 0);
		return primaryColor - vec4(0.2, 0.2, 0.2, 0.0);
	}

	if (renderBorderAt(tc, ps)) {
		return vec4(0.1, 0.1, 0.1, 1.0);
	}

	bool river = isRiverAt(tc);

	uint provinceIndex = getOrderedProvinceColorIndex(texture(u_provincesImage, tc).rgb);
	vec4 primaryColor = texelFetch(u_primaryProvincesColorImage, ivec2(provinceIndex, 0), 0);
	vec4 secondaryColor = texelFetch(u_secondaryProvincesColorImage, ivec2(provinceIndex, 0), 0);
	if (primaryColor != secondaryColor) {
		if (renderSecondaryColorAt(tc)) {
			return vec4(secondaryColor.rgb, secondaryColor.a * (river ? 0.8 :1.0));
		}
	}

	bool renderTerrain = primaryColor.a == 0.0;
	if (renderTerrain) {
		return vec4(0.0, 0.0, 0.0, river ? 0.4 : 0.4);
	}

	vec3 res = primaryColor.rgb;
	return vec4(res, primaryColor.a * (river ? 1.0 : 1.0));
}

void main() {
	vec2 ps = vec2(1.0 / u_textureSize.x, 1.0 / u_textureSize.y);
	vec4 res = vec4(edgeDetectionImage(v_texCoord, ps), 1.0);
	outEdgesColor = res;
	res = displayImage(v_texCoord, ps);
	outColor = res;
}
