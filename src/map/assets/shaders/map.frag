#version 300 es

precision mediump float;

uniform sampler2D u_terrainImage1;
uniform sampler2D u_terrainImage2;
uniform sampler2D u_riversImage1;
uniform sampler2D u_riversImage2;
uniform sampler2D u_provincesImage1;
uniform sampler2D u_provincesImage2;
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

in highp vec2 v_texCoord;

layout(location = 0) out vec4 outEdgesColor;
layout(location = 1) out vec4 outColor;

const vec3 viewDirection = vec3(0.0, 0.0, 1.0);

vec3 tcLayer(highp vec2 tc) {
    float layer = roundEven(tc.x);
    return vec3((tc.x - 0.5 * layer) * 2.0, tc.y, layer);
}

vec3 provincesAt(highp vec3 tc) {
    return tc.z <= 0.5 ?
        texture(u_provincesImage1, vec2(tc)).rgb :
        texture(u_provincesImage2, vec2(tc)).rgb;
}

vec3 terrainAt(highp vec3 tc) {
    return tc.z <= 0.5 ?
        texture(u_terrainImage1, vec2(tc)).rgb :
        texture(u_terrainImage2, vec2(tc)).rgb;
}

vec3[5] neighborhood(highp vec2 tc, vec2 ps) {
    // do not use initialize with array shorthand, otherwise some mobile
    // devices will throw a "no default precision defined for variable" error.
    // https://stackoverflow.com/a/73322269/433785
    vec3[5] result;
    result[0] = tcLayer(tc);
    result[1] = tcLayer(tc + vec2(0, -ps.y));
    result[2] = tcLayer(tc + vec2(0, ps.y));
    result[3] = tcLayer(tc + vec2(-ps.x, 0));
    result[4] = tcLayer(tc + vec2(ps.x, 0));
    return result;
}

// Use terrain image to determine sea terrain by checking against fixed sea terrain colors.
bool isSeaAt(highp vec3 terrain_color) {
    bool isDeepSea = all(greaterThan(terrain_color, vec3(0.03,0.12, 0.5))) && all(lessThan(terrain_color, vec3(0.04, 0.122, 0.52)));
    bool isInlandSea = all(greaterThan(terrain_color, vec3(0.21,0.35, 0.86))) && all(lessThan(terrain_color, vec3(0.218, 0.355, 0.865)));
    return isDeepSea || isInlandSea;
}

float ordering(vec3 c1, vec3 c2) {
    vec3 result = sign(c1 - c2);
    return dot(result, vec3(4.0, 2.0, 1.0));
}

// Get index of color in the ordered color array u_orderedColors
ivec2 getOrderedProvinceColorIndex(vec3 color)
{
    // Do binary search on u_orderedColors with float indices, since the ordered color data is saved in a texture
    uint l = 0u;
    uint r = u_provinceCount;
    while (l <= r)
    {
        uint m = (l + r) / 2u;

        uint col = m % 4096u;
        uint row = m / 4096u;
        ivec2 prov = ivec2(int(col), int(row));

        vec3 colorAtIndex = texelFetch(u_provincesUniqueColorsImage, prov, 0).rgb;
        float order = ordering(color, colorAtIndex);
        if (order > 0.0) {
            l = m + 1u;
            continue;
        }

        if (order < 0.0) {
            r = m - 1u;
            continue;
        }
        return prov;
    }
    return ivec2(0, 0);
}

bool renderSecondaryColorAt(highp vec2 tc) {
    vec2 size = vec2(textureSize(u_provincesImage1, 0)) * vec2(2.0, 1.0);
    vec2 pixel_coord = tc * size * 5.0;
    vec2 stripes_tc = mod(pixel_coord, 128.0)  / 128.0;
    stripes_tc.x = -stripes_tc.x;
    vec4 stripes_color = texture(u_stripesImage, stripes_tc);
    return stripes_color.a > 0.0;
}

bool borderCompare(highp vec3 t1, highp vec3 t2, vec3 prov1, vec3 prov2) {
    if (isSeaAt(t1) && !isSeaAt(t2)) {
        return false;
    }

    return (!isSeaAt(t1) && isSeaAt(t2)) || ordering(prov1, prov2) > 0.0;
}

bool hasBorder(highp vec4[5] data) {
    return data[0] != data[1] || data[0] != data[2] || data[0] != data[3] || data[0] != data[4];
}

vec3 edgeDetectionImage(
    highp vec3[5] tc,
    highp vec3[5] terrain,
    highp vec3[5] provinces,
    ivec2[5] provinceIndices,
    highp vec4[5] country,
    highp vec4[5] mapMode
) {
    if (isSeaAt(terrain[0])) {
        return vec3(0.5);
    }

    if (u_renderCountryBorders && hasBorder(country)) {
        return country[0].rgb - vec3(0.2, 0.2, 0.2);
    }

    if (u_renderMapmodeBorders && hasBorder(mapMode)) {
        return mapMode[0].rgb - vec3(0.2, 0.2, 0.2);
    }

    if (u_renderProvinceBorders) {
        for (int i = 1; i < 5; i++) {
            if (borderCompare(terrain[0], terrain[i], provinces[0], provinces[i])) {
                return vec3(0.1);
            }
        }
    }

    vec4 primaryColor = mapMode[0];
    vec4 secondaryColor = texelFetch(u_secondaryProvincesColorImage, provinceIndices[0], 0);
    if (primaryColor != secondaryColor && renderSecondaryColorAt(v_texCoord)) {
        return vec3(0.5);
    }

    return primaryColor.rgb;
}

vec4 displayImage(
    highp vec3[5] tc,
    highp vec3[5] terrain,
    highp vec3[5] provinces,
    ivec2[5] provinceIndices,
    highp vec4[5] country,
    highp vec4[5] mapMode   
) {
    if (isSeaAt(terrain[0])) {
        return vec4(0.0, 0.0, 1.0, 0.2);
    }

    if (u_renderCountryBorders && hasBorder(country)) {
        return country[0] - vec4(0.2, 0.2, 0.2, 0.0);
    }

    if (u_renderMapmodeBorders && hasBorder(mapMode)) {
        return mapMode[0] - vec4(0.2, 0.2, 0.2, 0.0);
    }

    if (u_renderProvinceBorders) {
        for (int i = 1; i < 5; i++) {
            if (borderCompare(terrain[0], terrain[i], provinces[0], provinces[i])) {
                return mapMode[0] - vec4(0.1, 0.1, 0.1, 0.0);
            }
        }
    }

    vec4 primaryColor = mapMode[0];
    vec4 secondaryColor = texelFetch(u_secondaryProvincesColorImage, provinceIndices[0], 0);
    if (primaryColor != secondaryColor && renderSecondaryColorAt(v_texCoord)) {
        return secondaryColor;
    }

    bool renderTerrain = primaryColor.a == 0.0;
    if (renderTerrain) {
        return vec4(0.0, 0.0, 0.0, 0.4);
    }

    return primaryColor;
}

void main() {
    vec2 ps = vec2(1.0 / u_textureSize.x, 1.0 / u_textureSize.y);

    vec3[5] tc = neighborhood(v_texCoord, ps);
    vec3[5] terrain;
    vec3[5] provinces;
    ivec2[5] provinceIndices;
    vec4[5] country;
    vec4[5] mapMode;

    for (int i = 0; i < 5; i++) {
        terrain[i] = terrainAt(tc[i]);
        provinces[i] = provincesAt(tc[i]);
        provinceIndices[i] = getOrderedProvinceColorIndex(provinces[i]);
        country[i] = texelFetch(u_countryProvincesColorImage, provinceIndices[i], 0);
        mapMode[i] = texelFetch(u_primaryProvincesColorImage, provinceIndices[i], 0);
    }

    outEdgesColor = vec4(edgeDetectionImage(tc, terrain, provinces, provinceIndices, country, mapMode), 1.0);
    outColor = displayImage(tc, terrain, provinces, provinceIndices, country, mapMode);
}
